// index.js

import Redis from "ioredis";

// IMPORTANT: Replace these with your actual MemoryDB details
const MEMORYDB_HOST = 'clustercfg.helix-collab-cluster.0s8vxt.memorydb.us-east-1.amazonaws.com';
const MEMORYDB_PORT = 6379;

// Use a global client to allow Lambda to reuse the connection across invocations.
// This is critical for performance and connection management.
let redisClient = null;

const getRedisClient = () => {
  if (redisClient) {
    return redisClient;
  }

  // Initialize the Redis client
  // Since MemoryDB clusters are usually in a VPC, ensure your Lambda is configured
  // to run in the same VPC and Subnets.
  // MemoryDB requires TLS/SSL, so we set `tls: {}`.
  redisClient = new Redis({
    host: MEMORYDB_HOST,
    port: MEMORYDB_PORT,
    tls: {}, // Enable TLS/SSL for MemoryDB
    connectTimeout: 10000, // 10 seconds timeout for connection
    maxRetriesPerRequest: 1, // Don't retry commands if connection is lost
  });

  // Handle connection errors
  redisClient.on('error', (err) => {
    console.error('[memdb] Redis Error:', err);
  });

  console.log('[memdb] New Redis client initialized.');
  return redisClient;
};

export async function testMemoryDB() {
  console.log('[memdb] Starting Lambda execution...');

  const client = getRedisClient();
  const key = 'myKey';

  try {
    // --- 1. INSERT/SET Operation ---
    const initialValue = 'initial-data';
    console.log(`[memdb] 1. Inserting key "${key}" with value: "${initialValue}"`);
    // SET command: Sets the key's value, 'OK' is returned on success
    let result = await client.set(key, initialValue);
    console.log('[memdb]    SET Result:', result); // Should output 'OK'

    // --- 2. READ/GET Operation ---
    console.log(`[memdb] 2. Reading value for key "${key}"`);
    // GET command: Retrieves the value of the key
    let currentValue = await client.get(key);
    console.log('[memdb]    GET Result (Initial):', currentValue); // Should output 'initial-data'

    // --- 3. UPDATE/SET Operation ---
    const updatedValue = 'updated-data-from-lambda';
    console.log(`[memdb] 3. Updating key "${key}" with new value: "${updatedValue}"`);
    // Re-using SET to overwrite the existing value (this is the "update" action)
    result = await client.set(key, updatedValue);
    console.log('[memdb]    SET Result:', result); // Should output 'OK'

    // --- 4. READ/GET Operation (Verification) ---
    console.log(`[memdb] 4. Reading value for key "${key}" after update`);
    let verifiedValue = await client.get(key);
    console.log('[memdb]    GET Result (Verified Update):', verifiedValue); // Should output 'updated-data-from-lambda'

    // Clean up the key after the test (optional)
    // await client.del(key);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully performed Insert, Read, and Update operations on MemoryDB.',
        verifiedValue: verifiedValue,
      }),
    };

  } catch (error) {
    console.error('[memdb] Operation Failed:', error);

    // Clean up and close the client on fatal error (optional)
    // redisClient.quit();
    // redisClient = null;

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to interact with MemoryDB.',
        error: error.message,
      }),
    };
  }
};
