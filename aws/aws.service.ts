import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { EC2Client, RunInstancesCommand, _InstanceType } from '@aws-sdk/client-ec2';
import { Injectable, OnModuleInit } from '@nestjs/common';

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const metadata = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata;
  const name = (error as { name?: string }).name;

  return (
    metadata?.httpStatusCode === 404 ||
    name === 'NotFound' ||
    name === 'NoSuchBucket'
  );
}

function errorName(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { name?: string }).name
    : undefined;
}

@Injectable()
export class AwsService implements OnModuleInit {
  private ec2Client!: EC2Client;
  private s3Client!: S3Client;

  onModuleInit(): void {
    const region =
      process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
    const endpoint =
      process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';

    const baseConfig = {
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      },
    };

    this.ec2Client = new EC2Client(baseConfig);
    this.s3Client = new S3Client({
      ...baseConfig,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }


  async createInstanceEC2(nome: string): Promise<string> {
    const instanceType = (process.env.AWS_EC2_INSTANCE_TYPE ??
      't3.micro') as _InstanceType;

    const command = new RunInstancesCommand({
      ImageId: process.env.AWS_EC2_AMI_ID ?? 'ami-amazonlinux2023',
      InstanceType: instanceType,
      MinCount: 1,
      MaxCount: 1,
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [{ Key: 'Name', Value: nome }],
        },
      ],
    });

    try {
      const response = await this.ec2Client.send(command);
      const instanceId = response.Instances?.[0]?.InstanceId;

      if (!instanceId) {
        throw new Error('A instancia EC2 nao foi retornada');
      }

      return instanceId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Falha ao criar instancia no Floci: ${message}`);
    }
  }

  
  async createBucketS3(nome: string): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: nome }));
      return;
    } catch (error) {
      if (!isNotFound(error)) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Falha ao verificar o bucket S3: ${message}`);
      }
    }

    try {
      await this.s3Client.send(new CreateBucketCommand({ Bucket: nome }));
    } catch (error) {
      const name = errorName(error);

      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Falha ao criar o bucket S3: ${message}`);
      }
    }
  }
}
