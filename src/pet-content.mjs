// Original, asset-free cow family. Personality meanings follow product revision 212.
export const forms = {
  calf: {
    name: "小牛",
    parent: null,
    color: "#f5ead7",
    accent: "#d7a77c",
    scale: 0.82,
    personality: "一本正经地看不懂世界；少语言，用动作和停顿表达。",
    phrase: "哞？",
  },
  normal: {
    name: "普通牛来",
    parent: "calf",
    color: "#eadac2",
    accent: "#998666",
    scale: 1,
    personality: "草根吹牛王，小动作也当成大工程。",
    phrase: "点头这一块，我多少算个头部。",
  },
  playful: {
    name: "骚牛",
    parent: "normal",
    color: "#eac8cf",
    accent: "#bb6584",
    scale: 1,
    personality: "自恋戏精，把桌面当红毯，愿意陪用户玩。",
    phrase: "给你表演一下，别拿去官宣。",
  },
  tough: {
    name: "硬牛",
    parent: "normal",
    color: "#b8c6c4",
    accent: "#486b64",
    scale: 1.08,
    personality: "死要面子的嘴硬杠精；身体配合，嘴不服软。",
    phrase: "我只是刚好也想这么做。",
  },
  celestial: {
    name: "仙牛",
    parent: "playful",
    color: "#e4ead7",
    accent: "#8ca778",
    scale: 1.02,
    personality: "一本正经装神的荒诞修仙家。",
    phrase: "贫道不是发呆，是灵魂出去蹭饭了。",
  },
  dark: {
    name: "暗黑牛",
    parent: "tough",
    color: "#77718c",
    accent: "#bba1ce",
    scale: 1.1,
    personality: "中二魔王，宇宙级野心撞上桌面级现实。",
    phrase: "反派没预算，全靠气质撑。",
  },
};
// Editable example vocabulary, not a claimed historical taxonomy or user emotion detection.
export const emotions = {
  neutral: {
    label: "平静",
    description: "宠物自然、放松的反馈",
    color: "#95aaa0",
  },
  curious: {
    label: "好奇",
    description: "宠物对新事物感兴趣，想了解更多",
    color: "#b7b86e",
  },
  joyful: {
    label: "开心",
    description: "宠物受到友好邀请、问候或鼓励",
    color: "#edb768",
  },
  proud: {
    label: "得意",
    description: "宠物被夸奖，表现自信和小骄傲",
    color: "#c793c7",
  },
  sad: {
    label: "委屈",
    description: "宠物被温和纠正后的低落表现，不用于指责用户",
    color: "#8ca4ca",
  },
  sleepy: {
    label: "困倦",
    description: "用户邀请休息、安静陪伴时的宠物状态",
    color: "#a5a0c6",
  },
};
const define = (id, label, description, poses, duration = 2000) => ({
  version: 1,
  id,
  label,
  description,
  interrupt: "hold-current",
  variants: [1, 0.72].map((amplitude, i) => ({
    id: i ? "gentle" : "clear",
    label: i ? "轻柔" : "鲜明",
    frames: [{}, ...poses, {}].map((pose, n, all) => ({
      atMs: Math.round((n * duration * (i ? 1.15 : 1)) / (all.length - 1)),
      pose: Object.fromEntries(
        Object.entries(pose).map(([k, v]) => [k, v * amplitude]),
      ),
    })),
  })),
});
export const actions = [
  define(
    "nod",
    "点一下头",
    "明确点头一次；确认或赞同",
    [{ headPitch: 0.7 }],
    1400,
  ),
  define(
    "nod_double",
    "点两次头",
    "明确点头两次，保留次数",
    [{ headPitch: 0.65 }, {}, { headPitch: 0.65 }],
    2400,
  ),
  define(
    "shake",
    "摇头",
    "左右摇头表示否定",
    [
      { headYaw: 0.65 },
      { headYaw: -0.65 },
      { headYaw: 0.4 },
      { headYaw: -0.4 },
    ],
    2400,
  ),
  define(
    "tilt_left",
    "左侧歪头",
    "向角色自身左侧歪头表示好奇",
    [{ headRoll: 0.55 }, { headRoll: 0.55 }],
    1800,
  ),
  define(
    "tilt_right",
    "右侧歪头",
    "向角色自身右侧歪头表示好奇",
    [{ headRoll: -0.55 }, { headRoll: -0.55 }],
    1800,
  ),
  define(
    "look_left",
    "向左看",
    "转头看角色自身左侧",
    [{ headYaw: 0.8 }, { headYaw: 0.8 }],
    1800,
  ),
  define(
    "look_right",
    "向右看",
    "转头看角色自身右侧",
    [{ headYaw: -0.8 }, { headYaw: -0.8 }],
    1800,
  ),
  define(
    "look_up",
    "抬头看看",
    "抬头并轻轻伸长脖子",
    [
      { headPitch: -0.5, headLift: 0.5 },
      { headPitch: -0.5, headLift: 0.5 },
    ],
    2000,
  ),
  define(
    "look_down",
    "低头看看",
    "低头看向面前",
    [
      { headPitch: 0.5, headLift: -0.25 },
      { headPitch: 0.5, headLift: -0.25 },
    ],
    2000,
  ),
  define(
    "wave_left",
    "左手招呼",
    "用角色自身左手挥手问候",
    [{ leftArm: 0.8 }, { leftArm: 0.4 }, { leftArm: 0.8 }, { leftArm: 0.4 }],
    2400,
  ),
  define(
    "wave_right",
    "右手招呼",
    "用角色自身右手挥手问候",
    [
      { rightArm: 0.8 },
      { rightArm: 0.4 },
      { rightArm: 0.8 },
      { rightArm: 0.4 },
    ],
    2400,
  ),
  define(
    "open_arms",
    "张开双臂",
    "张开两只手臂欢迎用户或邀请拥抱",
    [
      { leftArm: 0.6, rightArm: 0.6 },
      { leftArm: 0.6, rightArm: 0.6 },
    ],
    2200,
  ),
  define(
    "bow",
    "鞠躬",
    "身体前倾并低头致意",
    [
      { bodyLean: 0.6, headPitch: 0.25 },
      { bodyLean: 0.6, headPitch: 0.25 },
    ],
    2400,
  ),
  define(
    "sway",
    "左右摇摆",
    "身体随节奏左右转动，陪用户玩",
    [
      { bodyYaw: 0.4, headRoll: 0.2 },
      { bodyYaw: -0.4, headRoll: -0.2 },
      { bodyYaw: 0.4 },
      { bodyYaw: -0.4 },
    ],
    2800,
  ),
  define(
    "hop",
    "开心蹦一下",
    "原地向上弹跳一次的软件表现",
    [{ bodyLift: 0.7 }],
    1400,
  ),
  define(
    "stretch",
    "伸个懒腰",
    "伸长脖子并举起双臂",
    [
      { headLift: 0.7, headPitch: -0.35, leftArm: 0.7, rightArm: 0.7 },
      { headLift: 0.7, leftArm: 0.7, rightArm: 0.7 },
    ],
    2800,
  ),
  define(
    "doze",
    "打个瞌睡",
    "慢慢低头再抬回，安静陪伴",
    [
      { headPitch: 0.4, headLift: -0.2 },
      { headPitch: 0.65, headLift: -0.25 },
    ],
    3200,
  ),
  define(
    "celebrate",
    "举手庆祝",
    "双臂举起，身体轻轻左右庆祝",
    [
      { leftArm: 0.85, rightArm: 0.85, bodyYaw: 0.25 },
      { leftArm: 0.65, rightArm: 0.65, bodyYaw: -0.25 },
      { leftArm: 0.85, rightArm: 0.85 },
    ],
    2600,
  ),
];
const young = new Set([
  "nod",
  "nod_double",
  "shake",
  "tilt_left",
  "tilt_right",
  "look_left",
  "look_right",
  "look_up",
  "look_down",
  "doze",
]);
const grown = new Set([
  ...young,
  "wave_left",
  "wave_right",
  "open_arms",
  "bow",
]);
for (const action of actions)
  action.forms = Object.keys(forms).filter((form) =>
    form === "calf"
      ? young.has(action.id)
      : form === "normal" || form === "tough"
        ? grown.has(action.id)
        : true,
  );
export const availableActions = (form, catalog = actions) =>
  catalog.filter((a) => !a.forms || a.forms.includes(form));
