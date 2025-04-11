module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src/', '<rootDir>/tests/'],
    transform: {
      '^.+\\.tsx?$': 'ts-jest',
    },
    testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    collectCoverageFrom: [
      'src/**/*.{ts,tsx}',
      '!src/**/*.d.ts',
    ],
    coverageDirectory: 'coverage',
    moduleNameMapper: {
      '^@src/(.*)$': '<rootDir>/src/$1',
      '^@config/(.*)$': '<rootDir>/src/config/$1',
      '^@services/(.*)$': '<rootDir>/src/services/$1',
      '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    },
  };