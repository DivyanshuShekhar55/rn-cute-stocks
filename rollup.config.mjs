/* global process */
import path from "path";
import alias from "@rollup/plugin-alias";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";
import dts from "rollup-plugin-dts"; 

const extensions = [".js", ".ts", ".jsx", ".tsx"];
const { root } = path.parse(process.cwd());

// Path aliases — update these if you add internal package aliases later
export const entries = [];

// Peer dependencies — never bundled, must be installed by the consumer
const peerDependencies = [
  "react",
  "react-native",
  "@shopify/react-native-skia",
  "react-native-reanimated",
  "react-native-gesture-handler",
  "react-native-worklets",
  "d3-array",
  "d3-scale",
  "d3-shape",
];

// Returns true if the import should be treated as external (not bundled)
// Bundle only relative imports (./foo) or absolute disk paths
// Everything else — node_modules, peer deps — stays external
function isExternal(packagePath) {
  if (
    peerDependencies.some(
      (dep) => packagePath === dep || packagePath.startsWith(`${dep}/`),
    )
  ) {
    return true;
  }
  return !(packagePath.startsWith(".") || packagePath.startsWith(root));
}

// esbuild handles TS/TSX transpilation + JSX transform
// minify=false keeps output readable for consumers debugging issues
// target=es2017 is safe for all modern RN versions
function getESBuild() {
  return esbuild({
    minify: false,
    target: "es2017",
    jsx: "automatic",
    loaders: {
      ".js": "jsx",
      ".ts": "ts",
      ".tsx": "tsx",
    },
  });
}

// ESM build — used by bundlers (Metro, webpack) that support tree-shaking
function createESMConfig(input, output) {
  return {
    input,
    output: {
      file: output,
      format: "esm",
      sourcemap: true,
    },
    external: isExternal,
    plugins: [
      alias({ entries: entries.filter((entry) => !entry.find.test(input)) }),
      resolve({
        extensions,
        preferBuiltins: false, // important for React Native — no Node built-ins
      }),
      replace({
        // make the library work in both Node (process.env.NODE_ENV)
        // and Vite-style bundlers (import.meta.env.MODE)
        // .mjs output keeps import.meta.env as-is, .js output converts to process.env
        ...(output.endsWith(".js")
          ? { "import.meta.env?.MODE": "process.env.NODE_ENV" }
          : {
              "import.meta.env?.MODE":
                "(import.meta.env ? import.meta.env.MODE : undefined)",
            }),
        // replace full words only, don't touch assignments
        delimiters: ["\\b", "\\b(?!(\\.|/))"],
        preventAssignment: true,
      }),
      getESBuild(),
    ],
  };
}

// CJS build — used by Jest, older Metro configs, and require()-based consumers
function createCommonJSConfig(input, output) {
  return {
    input,
    output: {
      file: output,
      format: "cjs",
      sourcemap: true,
    },
    external: isExternal,
    plugins: [
      alias({ entries: entries.filter((entry) => !entry.find.test(input)) }),
      resolve({
        extensions,
        preferBuiltins: false,
      }),
      replace({
        "import.meta.env?.MODE": "process.env.NODE_ENV",
        delimiters: ["\\b", "\\b(?!(\\.|/))"],
        preventAssignment: true,
      }),
      getESBuild(),
    ],
  };
}

export default function (args) {
  let argsKeyArr = Object.keys(args);
  let configStr = argsKeyArr.find((key) => key.startsWith("config-"));

  if (configStr) {
    // extract the config name after 'config-'
    // e.g. --config-src_utils → src/utils
    configStr = configStr.slice("config-".length);
    configStr = configStr.replace(/_/g, "/");
    return [
      createCommonJSConfig(`src/${configStr}.ts`, `dist/${configStr}.js`),
      createESMConfig(`src/${configStr}.ts`, `dist/esm/${configStr}.mjs`),
    ];
  }

  // Default: build the single main entry point
  // All charts are re-exported from src/index.ts via the barrel file
  return [
    createCommonJSConfig("src/index.ts", "dist/index.js"),
    createESMConfig("src/index.ts", "dist/esm/index.mjs"),

    // this one so that dts works
    // dts makes sure every type is exported well, else we get all types as 'any'
    {
      input: "src/index.ts",
      output: { file: "dist/index.d.ts", format: "esm" },
      external: isExternal,
      plugins: [dts()],
    },
  ];
}
