import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// AWS region
const AWS_REGION = 'us-east-1';

// S3 bucket to store the images
const S3_BUCKET = process.env.BUCKET_NAME;

// create a client for interacting with the Bedrock service.
const client = new BedrockRuntimeClient({ region: AWS_REGION });

// create a client for interacting with S3.
const s3Client = new S3Client({ region: AWS_REGION });

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log(event);

  // check that request body exist and is not null or undefined.
  if (event.body) {
    const parsedBody = JSON.parse(event.body);

    // check that the request body has the required field.
    if (parsedBody.description) {
      const description = parsedBody.description;
      const titanConfig = getTitanConfig(description);

      const response = await client.send(
        new InvokeModelCommand({
          modelId: 'amazon.titan-image-generator-v2:0',
          body: JSON.stringify(titanConfig),
          accept: 'application/json',
          contentType: 'application/json',
        })
      );

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      if (responseBody.images) {
        const image = responseBody.images[0];
        const preSignedUrl = await saveImageToS3(image);

        return {
          statusCode: 200,
          body: JSON.stringify({ url: preSignedUrl }),
        };
      }
    }
  }

  return {
    statusCode: 400, // Bad Request - client error
    body: JSON.stringify({ message: 'Invalid request' }),
  };
}

// function to return the prompt.
function getTitanConfig(description: string) {
  return {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: description,
    },
    // model configurations
    imageGenerationConfig: {
      numberOfImages: 1,
      height: 512,
      width: 512,
      cfgScale: 8,
    },
  };
}

// function to save image to S3 bucket and return a pre-signed URL to that image.
async function saveImageToS3(image: string) {
  const imageFile = Buffer.from(image, 'base64');
  const key = `bedrockImage-${Date.now()}.png`;

  // save image to S3 bucket
  const putObjectCommand = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: imageFile,
    ContentEncoding: 'base64',
    ContentType: 'image/png',
  });
  await s3Client.send(putObjectCommand);

  // generate a pre-signed URL for image retrieval.
  // A pre-signed URL provides a secure way to give others temporary access to a private S3 object.
  // When generated, this URL contains specific security credentials allowing restricted-time access to the object.
  const getObjectCommand = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 3600 });

  return url;
}
