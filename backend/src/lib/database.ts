import mongoose from 'mongoose';
import { setServers } from 'node:dns';
import { isIP } from 'node:net';

mongoose.set('bufferCommands', false);

export async function connectDatabase(uri: string) {
  // Optional process-local workaround for networks whose DNS rejects SRV queries.
  const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (dnsServers?.length) {
    if (dnsServers.some((server) => !isIP(server))) throw new Error('Invalid MONGODB_DNS_SERVERS');
    setServers(dnsServers);
  }
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    autoIndex: false,
  });
}

export async function databaseReady(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  try {
    await mongoose.connection.db.admin().ping({ timeoutMS: 1500 });
    return true;
  } catch {
    return false;
  }
}
