# 许可证范围与版本边界 / Licensing and version boundary

## 当前许可 / Current license

本项目从 `agpl-3.0-start` 标记的许可证切换提交起，整体按照 **GNU Affero General Public License, version 3 only（AGPL-3.0-only）** 分发。完整正文见 [LICENSE](./LICENSE)，版权与来源说明见 [NOTICE](./NOTICE)。没有附加禁止商用、强制购买商业授权或其他额外限制。

Starting with the license-transition commit tagged `agpl-3.0-start`, the project as a whole is distributed under **GNU AGPL version 3 only (AGPL-3.0-only)**. See [LICENSE](./LICENSE) for the complete terms and [NOTICE](./NOTICE) for attribution. No noncommercial restriction, mandatory commercial-license purchase, or other additional restriction is imposed.

## 历史 MIT 版本 / Historical MIT versions

| 标签 / Tag | 含义 / Meaning |
| --- | --- |
| `mit-final` | 切换前最后一个项目整体采用 MIT 的快照 / Final project-wide MIT snapshot before the transition |
| `agpl-3.0-start` | 首次整体采用 AGPL-3.0-only 的提交 / First commit distributing the project as a whole under AGPL-3.0-only |

`mit-final` 固定指向 `fb57ddca483f3bfe816a3ca8e59d6d5208ef7c64`。该提交中的许可证及此前已经按 MIT 发布的代码继续保留原有授权。原版权与许可正文逐字保存在 [LICENSES/MIT-legacy.txt](./LICENSES/MIT-legacy.txt)。

`mit-final` points to `fb57ddca483f3bfe816a3ca8e59d6d5208ef7c64`. Code already released under MIT remains available under its original grant. The original copyright and permission notice is preserved verbatim in [LICENSES/MIT-legacy.txt](./LICENSES/MIT-legacy.txt).

新许可不追溯撤销旧 MIT 授权，也不把未改变的历史 MIT 代码变成只能按 AGPL 使用的代码。AGPL 是此后项目整体及按 AGPL 发布的新贡献、修改的许可；应同时保留其中历史 MIT 材料及第三方组件的原有声明。仓库中存在其他贡献者的作品，Git 历史中的署名和现有源文件声明应予保留。

The new license does not retroactively revoke MIT permissions or make unchanged historical MIT material exclusively AGPL-licensed. AGPL governs the project as a whole after the transition and new contributions and modifications released under AGPL. Preserve the original notices for historical MIT material and third-party components. Other contributors' authorship recorded in Git history and source-file notices remains intact.

## 使用与分发 / Use and distribution

- AGPL 允许个人使用和商业使用，不要求向本项目购买商业授权。
- 分发适用作品的可执行版本（例如 APK、Docker 镜像）时，按 AGPL 第 6 条提供对应源码，并保留相应许可及版权声明。
- 修改本程序后通过网络提供交互服务时，按第 13 条向交互用户显著提供免费获取该修改版本对应源码的方式。
- 对应源码应匹配实际分发或运行的版本，包括适用的修改及构建、安装和运行脚本。仅链接到不包含自己修改的上游仓库，不能替代提供这些修改的对应源码。
- 不要将 API Key、密码或其他部署凭据混入源码包；提供配置模板和必要说明即可。

Commercial and personal use are permitted. When distributing covered executable works, including APKs or Docker images, provide Corresponding Source under section 6 and preserve applicable notices. When offering a modified version for remote network interaction, prominently offer its users free access to that version's Corresponding Source under section 13. Source must match the actual version, including covered modifications and relevant build, installation, and execution scripts; an upstream link omitting your changes is insufficient. Use configuration templates rather than including deployment secrets.

## 部署与贡献 / Deployment and contributions

项目界面已有 GitHub 源码入口。部署自己的修改版时，应将源码入口指向实际部署版本的对应源码，而不是保留无法反映修改的上游链接。Docker 运行镜像会包含 `LICENSE`、`NOTICE`、`LICENSING.md` 和 `LICENSES/`；这些声明文件本身不替代对应源码的提供义务。

The application already links to its GitHub source. If you deploy a modified version, update the source link to provide the Corresponding Source for the version users actually run. The Docker runtime image includes `LICENSE`, `NOTICE`, `LICENSING.md`, and `LICENSES/`; including these notices does not replace source-provision obligations.

新增贡献请使用与当前项目兼容的许可，并保留引入的第三方代码声明。当前没有要求贡献者转让版权，也没有通过本说明取得替他人作品授予不同商业许可的权利。

Use a license compatible with the current project for new contributions and preserve notices for any third-party code you introduce. Contributors are not required by this notice to assign copyright, and this notice does not grant authority to offer others' work under a separate commercial license.

以上是项目的许可范围及操作说明，不替代 [AGPL 正文](./LICENSE)和适用材料的原有许可。

These notes explain project scope and practices; the [AGPL text](./LICENSE) and the original licenses of applicable materials govern.
