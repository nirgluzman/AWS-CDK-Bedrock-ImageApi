import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { join } from 'path';

import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';

import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';

export class ImageApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create an S3 bucket to store images
    const imageBucket = new Bucket(this, 'ImagesBucket', {
      bucketName: 'bedrock-images' + cdk.Stack.of(this).account,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL, // default setting
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // create a Lambda function to invoke Bedrock for image generation.
    const imageLambda = new NodejsFunction(this, 'ImageLambda', {
      runtime: Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      handler: 'handler',
      entry: join(__dirname, '..', 'services', 'image.ts'),
      environment: {
        BUCKET_NAME: imageBucket.bucketName,
      },
    });

    // grant the Lambda function permission to invoke Amazon Bedrock.
    imageLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    // simplified permission granting:
    // grant read/write permissions for a bucket and its contents to an IAM principal (Role/Group/User).
    imageBucket.grantReadWrite(imageLambda);

    // create an API Gateway REST API
    const api = new RestApi(this, 'ImageApi', {
      restApiName: 'Image API',
      description: 'This API allows you to generate image using Amazon Bedrock',
    });

    const imageResource = api.root.addResource('image');

    const imageLambdaIntegration = new LambdaIntegration(imageLambda);

    imageResource.addMethod('POST', imageLambdaIntegration);

    // output the URL of the API Gateway REST API
    new cdk.CfnOutput(this, 'ImageApiUrl', {
      value: api.url,
    });
  }
}
