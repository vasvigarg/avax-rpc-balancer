module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier",
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    // TypeScript specific rules
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-floating-promises": "error",

    // Import rules
    "import/order": [
      "error",
      {
        groups: [
          "builtin",
          "external",
          "internal",
          ["parent", "sibling"],
          "index",
          "object",
          "type",
        ],
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],

    // General rules
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    eqeqeq: ["error", "always"],
    curly: ["error", "all"],
    "prefer-const": "error",
  },
  ignorePatterns: ["dist", "node_modules", "*.js", "*.d.ts"],
  settings: {
    "import/resolver": {
      typescript: {},
    },
  },
  overrides: [
    {
      files: ["*.test.ts", "*.spec.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "no-console": "off",
      },
    },
  ],
};
