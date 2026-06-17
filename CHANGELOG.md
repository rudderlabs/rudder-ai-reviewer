# Changelog

## [1.2.0](https://github.com/rudderlabs/rudder-ai-reviewer/compare/v1.1.0...v1.2.0) (2026-06-17)


### Features

* gitlab scm provider ([#69](https://github.com/rudderlabs/rudder-ai-reviewer/issues/69)) ([a9b69f0](https://github.com/rudderlabs/rudder-ai-reviewer/commit/a9b69f0308a670ed3059648f24a5c220f5a91ed5))


### Bug Fixes

* correct SAT permission level in inputs table from editor to viewer ([#63](https://github.com/rudderlabs/rudder-ai-reviewer/issues/63)) ([b630afe](https://github.com/rudderlabs/rudder-ai-reviewer/commit/b630afe9c1230acab108218dc63c50a9d66e6c3b))
* skip review service when no relevant changes are detected ([#65](https://github.com/rudderlabs/rudder-ai-reviewer/issues/65)) ([30b8a70](https://github.com/rudderlabs/rudder-ai-reviewer/commit/30b8a70eda5d1654215aa58f15476ec7571290a7))
* **vuln:** pin and bump action refs (SEC-171) ([#62](https://github.com/rudderlabs/rudder-ai-reviewer/issues/62)) ([7ccb742](https://github.com/rudderlabs/rudder-ai-reviewer/commit/7ccb742dc865faee58395824639de3e2b7584017))


### Miscellaneous

* implement provider runtime for GitHub context handling ([#67](https://github.com/rudderlabs/rudder-ai-reviewer/issues/67)) ([6d06f39](https://github.com/rudderlabs/rudder-ai-reviewer/commit/6d06f398cf5b065f8a41e591c8da0a06c9ac53f8))
* **vuln:** zizmor --fix=all findings (SEC-199) ([#66](https://github.com/rudderlabs/rudder-ai-reviewer/issues/66)) ([bb73a0d](https://github.com/rudderlabs/rudder-ai-reviewer/commit/bb73a0df89de7fdf053709ed7c97891b87941528))


### Documentation

* bootstrap knowledge base for rudder-ai-reviewer ([#70](https://github.com/rudderlabs/rudder-ai-reviewer/issues/70)) ([15fdd2d](https://github.com/rudderlabs/rudder-ai-reviewer/commit/15fdd2d5a43dfd943b27e30ce292650039fa4af5))

## [1.1.0](https://github.com/rudderlabs/rudder-ai-reviewer/compare/v1.0.0...v1.1.0) (2026-02-20)


### Features

* add configurable base URL for PR Reviewer Service ([#28](https://github.com/rudderlabs/rudder-ai-reviewer/issues/28)) ([99086bc](https://github.com/rudderlabs/rudder-ai-reviewer/commit/99086bc0c690c435fc64ef695e353ab61a208d04))
* add fetch with retry logic to PRReviewerServiceClient ([#55](https://github.com/rudderlabs/rudder-ai-reviewer/issues/55)) ([71fa084](https://github.com/rudderlabs/rudder-ai-reviewer/commit/71fa084166f8be78de42add4e1caed13b79a8f73))
* add GitHub client and PR changes detection ([#21](https://github.com/rudderlabs/rudder-ai-reviewer/issues/21)) ([ff3f10d](https://github.com/rudderlabs/rudder-ai-reviewer/commit/ff3f10d92d9007c8b8bd37bb77430690f9691e35))
* basic setup ([d5f7d89](https://github.com/rudderlabs/rudder-ai-reviewer/commit/d5f7d89b96a727a6e8e20c13f31b8116fd597e81))
* basic setup ([bbf4f37](https://github.com/rudderlabs/rudder-ai-reviewer/commit/bbf4f37710cdfcb1091d4f6da6fa1fcf2d180dd7))
* change title to Rudder AI Reviewer ([#43](https://github.com/rudderlabs/rudder-ai-reviewer/issues/43)) ([7de76d0](https://github.com/rudderlabs/rudder-ai-reviewer/commit/7de76d0d68dfa79c48d0dd7a04b3b8acec176f68))
* detect js sdk ([99d5c90](https://github.com/rudderlabs/rudder-ai-reviewer/commit/99d5c9095834587af1383341ccea4be08ebdeec1))
* enhance CDNScanner with directory scanning and version extraction ([#26](https://github.com/rudderlabs/rudder-ai-reviewer/issues/26)) ([ab697d8](https://github.com/rudderlabs/rudder-ai-reviewer/commit/ab697d8dfae7866627aa00d8705e5068ff823899))
* enhance README with detailed usage instructions and examples ([#53](https://github.com/rudderlabs/rudder-ai-reviewer/issues/53)) ([82bed22](https://github.com/rudderlabs/rudder-ai-reviewer/commit/82bed22e5d2dd81126c95ec89ed61b10f1b0e256))
* implement file filtering for PR changes detection ([#60](https://github.com/rudderlabs/rudder-ai-reviewer/issues/60)) ([e0b95f3](https://github.com/rudderlabs/rudder-ai-reviewer/commit/e0b95f38d13c327b821a76da640158d15e9ac7a2))
* implement framework detection module ([#17](https://github.com/rudderlabs/rudder-ai-reviewer/issues/17)) ([6071f47](https://github.com/rudderlabs/rudder-ai-reviewer/commit/6071f4787b73d53f61456670b160d00b5c38f437))
* implement inline comments ([#42](https://github.com/rudderlabs/rudder-ai-reviewer/issues/42)) ([293b707](https://github.com/rudderlabs/rudder-ai-reviewer/commit/293b70707b8762cb7e06822f3cadddfac0b33abf))
* implement review comment functionality ([#22](https://github.com/rudderlabs/rudder-ai-reviewer/issues/22)) ([de48781](https://github.com/rudderlabs/rudder-ai-reviewer/commit/de487811626122f8f71864da720cbfff6a362aec))
* initial js sdk detector ([4b1a255](https://github.com/rudderlabs/rudder-ai-reviewer/commit/4b1a255525c29e3e7c9c6873c923b7c5161e5879))
* integrate posting comment in main flow ([#25](https://github.com/rudderlabs/rudder-ai-reviewer/issues/25)) ([d7de58a](https://github.com/rudderlabs/rudder-ai-reviewer/commit/d7de58a1f661a392531ca443f7e5ed7d786ac1eb))
* integrate with pr reviewer service ([#23](https://github.com/rudderlabs/rudder-ai-reviewer/issues/23)) ([f2e72f4](https://github.com/rudderlabs/rudder-ai-reviewer/commit/f2e72f4108459ddfec04416ee43992a51a9081c8))
* update control flow of the action ([#27](https://github.com/rudderlabs/rudder-ai-reviewer/issues/27)) ([48134e5](https://github.com/rudderlabs/rudder-ai-reviewer/commit/48134e5deb4ae582dd1345a38fe2c0d66518148e))


### Bug Fixes

* add root directory filtering to PR changes detection ([#35](https://github.com/rudderlabs/rudder-ai-reviewer/issues/35)) ([c0910cb](https://github.com/rudderlabs/rudder-ai-reviewer/commit/c0910cb55362dcf9410e5dc59bb8f6ced689a98a))
* change PR review endpoint to v2 ([#30](https://github.com/rudderlabs/rudder-ai-reviewer/issues/30)) ([a29e662](https://github.com/rudderlabs/rudder-ai-reviewer/commit/a29e662397bc87800cd7babf2be864f85cbf0c21))
* for code scanning alert no. 1: Bad HTML filtering regexp ([d242760](https://github.com/rudderlabs/rudder-ai-reviewer/commit/d24276092228d24b7069bbd0acd22f5c6042a7da))
* improve formatting of suggested fix in review comments ([#36](https://github.com/rudderlabs/rudder-ai-reviewer/issues/36)) ([18c9816](https://github.com/rudderlabs/rudder-ai-reviewer/commit/18c981668ffb034501a109ac49af4efea6f671f4))


### Miscellaneous

* add debug logging ([#33](https://github.com/rudderlabs/rudder-ai-reviewer/issues/33)) ([d03c4e1](https://github.com/rudderlabs/rudder-ai-reviewer/commit/d03c4e1dd461277c3efacfa90b82e23c2b9f8425))
* add permissions to test-action.yml ([53f6588](https://github.com/rudderlabs/rudder-ai-reviewer/commit/53f6588e0df0360912aa402fafb589d46f309200))
* add release-please configuration and workflow files ([#54](https://github.com/rudderlabs/rudder-ai-reviewer/issues/54)) ([2765a1b](https://github.com/rudderlabs/rudder-ai-reviewer/commit/2765a1bd97c63099a8574626360ab2c75a9bcdf3))
* add test step to build workflow ([#31](https://github.com/rudderlabs/rudder-ai-reviewer/issues/31)) ([e70cc3f](https://github.com/rudderlabs/rudder-ai-reviewer/commit/e70cc3f2af333b64ee9e4ba7a08ddfd09f52f823))
* change endpoint ([#57](https://github.com/rudderlabs/rudder-ai-reviewer/issues/57)) ([f069070](https://github.com/rudderlabs/rudder-ai-reviewer/commit/f0690709a065b4f7b513ae68ab3306cea64f93ad))
* change to composite action ([b359ecd](https://github.com/rudderlabs/rudder-ai-reviewer/commit/b359ecdb183feef8a0f6e29d6b5f95cfb6959ad2))
* formatting ([6dc245a](https://github.com/rudderlabs/rudder-ai-reviewer/commit/6dc245aa9a014602c55b83220b55662ae282e0d5))
* remove 'info' severity from issue ([#51](https://github.com/rudderlabs/rudder-ai-reviewer/issues/51)) ([6530066](https://github.com/rudderlabs/rudder-ai-reviewer/commit/6530066987db14aff451d074d22bf3f56dc457d7))
* remove unnecessary details from detection ([0086a83](https://github.com/rudderlabs/rudder-ai-reviewer/commit/0086a83f558ea79613952a72e203686d151b8dae))
* replace console.error with core.error ([#24](https://github.com/rudderlabs/rudder-ai-reviewer/issues/24)) ([e23848a](https://github.com/rudderlabs/rudder-ai-reviewer/commit/e23848a842b414d6a0303035c59df3cb913f5d66))
* test apps js ([#29](https://github.com/rudderlabs/rudder-ai-reviewer/issues/29)) ([fcc002f](https://github.com/rudderlabs/rudder-ai-reviewer/commit/fcc002faa1b6db0f81d7ec59dbbebfa6eaf9cf9e))
* update SDK detection methods to return null ([6458478](https://github.com/rudderlabs/rudder-ai-reviewer/commit/64584788206c04a51fdb939f5d2533cfca7ae050))
* updated LockFileParser to utilize snyk-nodejs-lockfile-parser ([b925bae](https://github.com/rudderlabs/rudder-ai-reviewer/commit/b925bae55f9b04f3e816848dd7fa38a1b7e67fb4))
