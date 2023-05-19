import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import ECS from 'aws-sdk/clients/ecs';

const ecs = new ECS();

const getEnvironmentVariable = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
};

export const startContainer: any = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.body === null) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body is missing' }),
    };
  }
  console.log('Received event:', event);

  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body must be valid JSON' }),
    };
  }

  const configURL = requestBody.configURL;
  const secretToken = requestBody.secretToken;

  if (!secretToken) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'No token provided' }),
    };
  }

  const isValidToken = await validateAuthToken(secretToken);
  if (!isValidToken) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid token' }),
    };
  }

  try {
    const params = {
      taskDefinition: getEnvironmentVariable('TASK_DEFINITION'),
      cluster: getEnvironmentVariable('CLUSTER'),
      count: 1, 
      capacityProviderStrategy: [
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        },
      ],
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [getEnvironmentVariable('SUBNET')],
          securityGroups: [getEnvironmentVariable('SECURITY_GROUP')],
          assignPublicIp: 'ENABLED',
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: getEnvironmentVariable('CONTAINER_NAME'),
            environment: [
              {
                name: 'CONFIG_URL',
                value: configURL,
              },
              {
                name: 'MSG',
                value: configURL,
              }
            ],
          },
        ],
      },
    };

    await ecs.runTask(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Container started successfully' }),
    };
  } catch (error) {
    console.error('Error starting container:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error starting container', error: error.message }),
    };
  }
};

const validateAuthToken = async (token: string): Promise<boolean> => {
  return token == getEnvironmentVariable('SECRET_TOKEN');
};

