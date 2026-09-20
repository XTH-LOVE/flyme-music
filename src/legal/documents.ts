/**
 * The About page's legal documents.
 *
 * Written from what the code actually does rather than from a template: a
 * privacy policy that describes data flows the app does not have - or omits
 * ones it does - is worse than none, because it is a statement the user is
 * meant to rely on.
 *
 * Every network destination named below was read out of the source. The list is
 * short on purpose: there is no analytics SDK, no ad SDK and no crash reporter
 * in this project.
 */

export interface LegalDocument {
  id: string;
  title: string;
  summary: string;
  updated: string;
  sections: { heading: string; body: string[] }[];
}

const UPDATED = '2026-09-21';

export const PRIVACY_POLICY: LegalDocument = {
  id: 'privacy',
  title: '隐私政策',
  summary: '本应用把数据留在你的设备上。以下说明全部会离开设备的内容。',
  updated: UPDATED,
  sections: [
    {
      heading: '一、留在设备上的数据',
      body: [
        '以下数据只写入本机存储（localStorage / IndexedDB），不会上传到任何服务器：',
        '· 收藏、播放历史、播放统计与听歌日历',
        '· 自建歌单、歌词偏移与字号、主题与外观设置',
        '· 导入的本地音频文件与音频特征分析结果',
        '· AI 对话记录与长期记忆',
        '卸载应用或清除应用数据即可全部删除。',
      ],
    },
    {
      heading: '二、会离开设备的数据',
      body: [
        '应用在以下情形会发起网络请求，除此之外不会主动发送任何数据。',
        '1. 搜索、播放与歌词：为了找到并播放歌曲，会把关键词或歌曲标识发送给所选的音源服务（网易云音乐、QQ 音乐、酷我音乐、JOOX、Bilibili 等），以及用于转发这些请求的聚合服务。这些请求不包含你的身份信息。',
        '2. 封面与图片：封面图片通过图片代理服务获取，请求中只包含图片地址。',
        '3. 版本更新检查：向 GitHub 查询最新版本号与安装包信息，请求中不包含任何个人信息。',
        '4. AI 功能：使用「一起听」的 AI 对话时，会把你的提问，以及为回答所需的最小上下文（当前歌曲信息、页面位置、听歌偏好摘要）发送给你所配置的 AI 服务商。对话内容不会发送给其他任何一方。',
        '5. 账号（可选）：只有在你主动注册或登录时才使用。账号由 Supabase 提供，存储邮箱或用户名及加密后的凭据。',
        '6. 一起听（可选）：只有在你主动开启房间时才使用，通过 Supabase 同步播放进度与歌单，房间内成员可见。',
      ],
    },
    {
      heading: '三、我们不做什么',
      body: [
        '· 没有广告，没有广告 SDK。',
        '· 没有第三方统计、埋点或崩溃上报。你的使用行为不会被回传给我们。',
        '· 不会读取、上传或分析你的本地音频文件内容。本机标签解析全部在设备上完成。',
        '· 不会把你的数据出售或提供给第三方。',
      ],
    },
    {
      heading: '四、权限说明',
      body: [
        '· 网络：搜索、播放、歌词与更新检查所必需。',
        '· 通知：仅用于后台播放时显示播放状态。',
        '· 后台运行：仅在应用退到后台时启用，用于保持音乐继续播放。',
        '· 存储：仅在你主动导入本地音乐时读取你选择的文件。',
      ],
    },
    {
      heading: '五、第三方音源与版权',
      body: [
        '本应用不存储、不托管任何音乐内容，也不提供音乐下载服务。播放内容来自第三方公开接口，版权归各权利人所有。',
        '这些接口并非官方开放接口，其可用性、稳定性与合法性由相应服务方决定，本应用不对其内容负责。',
      ],
    },
    {
      heading: '六、联系与变更',
      body: [
        '本政策如有变更会在应用内更新，并同步修改顶部的更新日期。',
        '如对隐私处理有疑问，可通过项目仓库提交 issue。',
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  id: 'terms',
  title: '用户协议',
  summary: '使用本应用前请阅读以下条款。继续使用即视为接受。',
  updated: UPDATED,
  sections: [
    {
      heading: '一、服务内容',
      body: [
        '本应用是一款音乐播放器，提供本地音频播放、第三方音源在线播放、歌词显示、歌单管理与播放统计等功能。',
        '本应用是播放工具，不是音乐内容提供方。',
      ],
    },
    {
      heading: '二、你的责任',
      body: [
        '· 你应确保对所播放、导入的内容拥有合法权利，或已获得相应授权。',
        '· 你不得利用本应用从事任何违反法律法规的活动。',
        '· 你应对账号凭据的保管负责。账号相关操作产生的后果由你承担。',
      ],
    },
    {
      heading: '三、第三方音源',
      body: [
        '在线播放依赖第三方公开接口。这些接口可能随时变更、限流或停止服务，导致部分歌曲无法搜索或播放。',
        '本应用不对第三方接口的可用性、准确性或内容合法性作出任何承诺。',
      ],
    },
    {
      heading: '四、AI 功能',
      body: [
        'AI 对话与推荐由第三方大模型生成，可能存在不准确或不适当的内容，仅供参考。',
        'AI 生成的内容不代表本应用的立场。',
      ],
    },
    {
      heading: '五、免责',
      body: [
        '本应用按「现状」提供，不对因使用或无法使用本应用造成的任何损失承担责任。',
        '因不可抗力、网络故障、第三方服务中断导致的服务不可用，本应用不承担责任。',
      ],
    },
    {
      heading: '六、开源与许可',
      body: [
        '本应用基于开源软件构建，并遵循相应开源许可。详见「开源许可」一节。',
        '本应用自身代码的许可条款以项目仓库中的 LICENSE 文件为准。',
      ],
    },
  ],
};

export const OPEN_SOURCE: LegalDocument = {
  id: 'opensource',
  title: '开源许可',
  summary: '本应用基于以下开源项目构建，在此致谢。',
  updated: UPDATED,
  sections: [
    {
      heading: '前端',
      body: [
        '· React — MIT',
        '· React Router — MIT',
        '· Vite — MIT',
        '· TypeScript — Apache-2.0',
        '· Zustand — MIT',
        '· vite-plugin-pwa / Workbox — MIT',
        '· Supabase JS — MIT',
        '· date-fns — MIT',
      ],
    },
    {
      heading: '桌面与移动端',
      body: [
        '· Tauri — Apache-2.0 / MIT',
        '· Rust 标准库与生态 — Apache-2.0 / MIT',
        '· tauri-plugin-http / tauri-plugin-dialog / tauri-plugin-opener / tauri-plugin-log — Apache-2.0 / MIT',
        '· lofty（音频标签解析） — MIT / Apache-2.0',
        '· RustCrypto aes — Apache-2.0 / MIT',
      ],
    },
    {
      heading: '完整清单',
      body: [
        '以上为主要依赖。完整依赖清单及其许可文本见项目仓库：',
        '· 前端与 Node 依赖：package-lock.json',
        '· Rust 依赖：src-tauri/Cargo.lock',
        '· 第三方声明：THIRD-PARTY-NOTICES（如仓库中提供）',
      ],
    },
    {
      heading: '致谢',
      body: [
        '界面与交互设计参考了 Halcyon、Otter Music 等开源音乐播放器，在此致谢。',
        '本应用不包含上述项目的代码，仅在设计与交互上借鉴。',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [PRIVACY_POLICY, TERMS_OF_SERVICE, OPEN_SOURCE];
