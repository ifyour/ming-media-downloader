import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "ming-media-downloader",
		compatibilityDate: "2024-01-01",
		compatibilityFlags: ["nodejs_compat"],
		entrypoint: "src/index.ts",
		assets: {
			notFoundHandling: "single-page-application",
		},
		env: {
			MMD_CACHE: bindings.kv({
				id: "2eec2097d5644ce4be6353715051eed7",
			}),
			ASSETS: bindings.assets(),
			MYBROWSER: bindings.browser(),
		},
	},
});
