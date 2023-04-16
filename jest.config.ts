import type { Config } from 'jest';

const config: Config = {
  verbose: true,
  coverageDirectory: 'coverage',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '\\.(test|spec)\\.tsx?$'
};

export default config;
