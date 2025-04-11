// src/utils/environment.ts
import fs from 'fs';
import path from 'path';

export function loadEnvironmentConfig(env: string): Record<string, any> {
  const configPath = path.join(__dirname, '../../config/environments', `${env}.json`);
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error(`Failed to load environment config for ${env}:`, error);
    return {};
  }
}