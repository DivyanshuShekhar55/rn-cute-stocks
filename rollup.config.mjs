/* global process*/
import path from "path";
import alias from "@rollup/plugin-alias";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";

const extensions = [".js", ".ts", ".jsx", ".tsx"];
const { root } = path.parse(process.cwd());

export const entries = [
  { find: /.*\/rn\.js$/, replacement: "rn-cute-stocks" },
  { find: /.*\/math\.js$/, replacement: "rn-cute-stocks/math" }
];

function isExternal(package_path) {
  // tells whether to bundle a package or not
  // dont bundle if like import "linear" from "d3-scale" (id=d3-scale)
  // bundle if starts like "./index" or C://...index.js
  return !(package_path.startsWith(".") || package_path.startsWith(root));
}

function getESBuild() {
  return esbuild({
    minify: true,
    target: "es2018",
    jsx:"automatic",
    loaders:{
      ".js":"jsx",
    }
  });
}
// create the es-module func
function createESMConfig(input, output) {
  return {
    input,
    output: { file: output, format: "esm" },
    external: isExternal,
    plugins: [
      alias({ entries: entries.filter((entry) => !entry.find.test(input)) }),
      resolve({ extensions }),
      replace({
        // no env used in this codebase as of writing it, but following is for making codebase future-proof
        // makes the library useful for both users of libraries Node (which uses process.env.NODE_ENV)
        // also for some frameworks like Vite where we use import.meta.env?.MODE
        ...(output.endsWith(".js")
          ? {
              "import.meta.env?.MODE": "process.env.NODE_ENV",
            }
          : {
              "import.meta.env?.MODE":
                "(import.meta.env ? import.meta.env.MODE : undefined)",
            }),

        // replace the full word only
        // also don't touch if there is an assignment to the value happening
        delimiters: ["\\b", "\\b(?!(\\.|/))"],
        preventAssignment: true,
      }),
      getESBuild(),
    ],
  };
}

function createCommonJSConfig(input, output) {
  return {
    input,
    output: { file: output, format: "cjs" },
    external: isExternal,
    // plugins are middlewares that tell abt step wise transformation of our code
    plugins: [
      alias({ entries: entries.filter((entry) => !entry.find.test(input)) }),
      resolve({ extensions }),
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
  let args_key_arr = Object.keys(args);
  let config_str = args_key_arr.find((key) => key.startsWith("config-"));

  if (config_str) {
    // extract the config name after 'config-'
    config_str = config_str.slice("config-".length);
    // optionally remove the underscores from the config names
    // like src_utils becomes src/utils
    config_str = config_str.replace(/_/g, "/");
  } else {
    config_str = "index";
  }
  return [
    createCommonJSConfig(`src/${config_str}.js`, `dist/${config_str}.js`),
    createESMConfig(`src/${config_str}.js`, `dist/esm/${config_str}.mjs`),
  ];
}
