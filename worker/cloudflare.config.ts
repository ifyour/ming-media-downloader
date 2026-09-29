import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "ming-media-downloader-api",
		compatibilityDate: "2024-01-01",
		entrypoint: "src/index.ts",
		env: {
			MMD_CACHE: bindings.kv({
				id: "2eec2097d5644ce4be6353715051eed7",
			}),
		},
	},
});
