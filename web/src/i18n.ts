import type { PhotoPreference } from "./types";

export type Language = "en" | "zh-Hant";

export interface AppCopy {
  languageButton: string;
  languageAria: string;
  homeAria: string;
  theme: { dark: string; light: string; switchToDark: string; switchToLight: string };
  labels: { vision: string; judge: string; newRun: string; ai: string; localFallback: string; visionAi: string };
  phase: { uploading: string; extracting: string; loop1: string; loop2: string };
  banners: { vision: string };
  pipeline: { loop2Title: string; loop2Note: string; loop2Tag: string };
  footer: { assistant: string; creator: string };
  landing: {
    editionPrototype: string;
    editionLoop: string;
    editionTagline: string;
    kicker: string;
    title: string;
    slogan: string;
    dek: string;
    startVideo: string;
    readHow: string;
    capabilitiesAria: string;
    capabilities: string[];
    imageAlt: string;
    imageCaption: [string, string];
    newsLabel: string;
    newsCopy: string;
    problemKicker: string;
    problemTitle: string;
    problemParagraphs: [string, string];
    problemQuote: string;
    methodKicker: string;
    methodTitle: string;
    methodDescription: string;
    methodCards: Array<{ index: string; title: string; copy: string }>;
    formulaAria: string;
    formula: string[];
    usesKicker: string;
    usesTitle: string;
    usesDescription: string;
    useItems: string[];
    futureKicker: string;
    futureTitle: string;
    futureDescription: string;
    futureItems: Array<{ number: string; title: string; copy: string }>;
    proKicker: string;
    proTitle: string;
    proDescription: string;
    proItems: string[];
    closingKicker: string;
    closingTitle: string;
    uploadVideo: string;
  };
  upload: {
    eyebrow: string;
    title: string;
    description: string;
    drop: string;
    browse: string;
    preferenceLegend: string;
    bestShots: string;
    judged: string;
    run: string;
    working: string;
  };
  preferences: Record<PhotoPreference, { label: string; description: string }>;
  infra: {
    stack: string;
    frameIntelligence: string;
    selected: string;
    preference: string;
    processing: string;
    local: string;
    browserNote: string;
    api: string;
    standard: string;
    apiNote: string;
  };
  loop1: { title: string; clearedBar: string; roundCap: string; reranking: string; round: string };
  loop2: {
    preparing: string;
    clearedBar: string;
    roundCap: string;
    round: string;
    scrub: string;
    cached: string;
  };
  output: {
    tag: string;
    title: string;
    winner: string;
    save: string;
    edit: string;
    closeEdit: string;
    reset: string;
    brightness: string;
    contrast: string;
    saturation: string;
    feedback: string;
    feedbackHint: string;
    feedbackPlaceholder: string;
    refine: string;
    refining: string;
    feedbackApplied: string;
    feedbackFallback: string;
    repairBlur: string;
    repairingBlur: string;
    repairWarning: string;
    generatedRepair: string;
    blurRisk: string;
  };
}

export const COPY: Record<Language, AppCopy> = {
  en: {
    languageButton: "中文",
    languageAria: "Switch to Traditional Chinese",
    homeAria: "Precious Frame home",
    theme: { dark: "Dark", light: "Light", switchToDark: "Switch to dark mode", switchToLight: "Switch to light mode" },
    labels: { vision: "AI", judge: "AI", newRun: "new run", ai: "AI", localFallback: "local fallback", visionAi: "AI vision" },
    phase: { uploading: "extracting video frames", extracting: "preparing frames", loop1: "loop 1 / selecting frames", loop2: "loop 2 / refining edits" },
    banners: { vision: "AI" },
    pipeline: { loop2Title: "Edit refinement", loop2Note: "one bounded correction per round, lowest-scoring axis first / bar", loop2Tag: "LOOP 2" },
    footer: { assistant: "AI visual storytelling assistant", creator: "Creator & builder:" },
    landing: {
      editionPrototype: "Prototype edition · 2026",
      editionLoop: "Loop engineering for visual stories",
      editionTagline: "Don't miss any frames",
      kicker: "The visual moment report",
      title: "Your video is full of photographs waiting to be found.",
      slogan: "Don't miss any frames.",
      dek: "We don't like AI-generated pics. We use AI to attract real-world clip photos: the actual moments already inside your videos, selected and refined for the places you publish.",
      startVideo: "Start with a video",
      readHow: "Read how it works",
      capabilitiesAria: "Precious Frame capabilities",
      capabilities: ["Extract", "Select", "Refine"],
      imageAlt: "A contact sheet of video frames with standout moments selected for a finished photograph",
      imageCaption: ["Contact sheet study no. 01", "From continuous motion to a deliberate frame"],
      newsLabel: "Now processing",
      newsCopy: "One video. Thousands of frames. A small set worth keeping.",
      problemKicker: "The problem",
      problemTitle: "The best frame rarely announces itself.",
      problemParagraphs: ["A short clip can hold thousands of expressions, gestures, compositions, and changes in light. Finding the one frame that feels intentional is still a slow manual job.", "Precious Frame treats a video like a contact sheet. It evaluates sharpness, exposure, contrast, color, visual interest, and variety, then keeps the moments that work together as a set."],
      problemQuote: "“Today, Precious Frame finds the best photos hidden inside videos.”",
      methodKicker: "Loop engineering",
      methodTitle: "It does not stop at the first answer.",
      methodDescription: "The agent makes a choice, observes the result, scores it, applies one bounded correction, and repeats until the work clears the quality bar or reaches the round cap.",
      methodCards: [
        { index: "01 / Contact sheet", title: "Extract candidate frames", copy: "Turn raw motion into a visual sequence while preserving the timing of every candidate moment." },
        { index: "02 / Loop one", title: "Select strength and variety", copy: "Re-rank the strongest frames and remove near-duplicates so the final set tells more than one beat." },
        { index: "03 / Loop two", title: "Critique and refine", copy: "Adjust crop, exposure, contrast, saturation, temperature, or sharpening one decision at a time." },
      ],
      formulaAria: "Precious Frame processing loop",
      formula: ["Act", "Observe", "Score", "Correct", "Repeat"],
      usesKicker: "One moment, many lives",
      usesTitle: "Made for the places visual stories actually go.",
      usesDescription: "The current prototype returns a strong finished photo set. The next step is to understand the visual goal of each destination and shape the output around it.",
      useItems: ["Instagram posts", "TikTok thumbnails", "YouTube thumbnails", "Profile photos", "Highlight covers", "Promotional materials"],
      futureKicker: "What is next",
      futureTitle: "From visual quality to personal visual taste.",
      futureDescription: "General quality is only the beginning. Precious Frame is designed to grow into an assistant that understands why one image feels like yours and another does not.",
      futureItems: [
        { number: "01", title: "A personal aesthetic model", copy: "Learn from saved photos, preferred styles, previous edits, and engagement patterns to understand what makes an image feel like you." },
        { number: "02", title: "Advanced style transformation", copy: "Turn one real moment into CCD, Y2K, film, cinematic, editorial, meme, and platform-specific versions." },
        { number: "03", title: "Intelligent repurposing", copy: "Prepare the right crop, treatment, and visual emphasis for Instagram, TikTok, YouTube, profiles, and promotions." },
        { number: "04", title: "A professional creative assistant", copy: "Support photo culling, batch suggestions, consistent style matching, client preferences, and faster post-production." },
        { number: "05", title: "Photo intelligence everywhere", copy: "Bring Precious Frame to camera apps, social platforms, creator tools, sports, events, memories, and travel products as an SDK." },
      ],
      proKicker: "For working photographers",
      proTitle: "More time creating. Less time sorting.",
      proDescription: "Precious Frame is not intended to replace a photographer's eye. It is an editing partner for the repetitive work: culling, comparing, checking consistency, and preparing a first pass.",
      proItems: ["Automatic photo culling", "Batch editing suggestions", "Consistent style matching", "Client-specific preferences"],
      closingKicker: "The next frame is already there",
      closingTitle: "Turn motion into something worth remembering.",
      uploadVideo: "Upload a video",
    },
    upload: { eyebrow: "Start a run", title: "Upload your video", description: "Precious Frame works best with short reels, clips, and highlight videos.", drop: "Drop a video here or", browse: "browse", preferenceLegend: "What should make a frame stand out?", bestShots: "best shots", judged: "Frames are judged by AI and refined locally with Sharp.", run: "Run the loops", working: "working…" },
    preferences: {
      balanced: { label: "Balanced", description: "A strong all-purpose mix of moment, story, craft, and composition." },
      "people-emotion": { label: "People & emotion", description: "Expressions, connection, gestures, and moments that cannot be recreated." },
      competition: { label: "Competition", description: "Professional impact, deliberate framing, controlled light, and finish." },
      "action-energy": { label: "Action & energy", description: "Decisive movement, expressive body position, and readable energy." },
      "scenic-composed": { label: "Scenic & composed", description: "Light, depth, geometry, atmosphere, and environmental storytelling." },
    },
    infra: { stack: "Processing stack", frameIntelligence: "Frame intelligence", selected: "selected", preference: "Photo preference", processing: "Video and image processing", local: "local", browserNote: "The browser extracts real frames; Sharp applies crop, color, and detail edits.", api: "Application API", standard: "standard", apiNote: "Express processes frames and streams the complete run over one SSE request." },
    loop1: { title: "Frame selection", clearedBar: "cleared bar", roundCap: "round cap", reranking: "re-ranking…", round: "round" },
    loop2: { preparing: "preparing", clearedBar: "cleared bar", roundCap: "round cap", round: "round", scrub: "scrub rounds", cached: "cached" },
    output: {
      tag: "OUTPUT",
      title: "Finished set",
      winner: "WINNER",
      save: "Save photo",
      edit: "Edit",
      closeEdit: "Close editor",
      reset: "Reset",
      brightness: "Brightness",
      contrast: "Contrast",
      saturation: "Color",
      feedback: "Direct the AI",
      feedbackHint: "Describe a better crop or adjustment for this photo.",
      feedbackPlaceholder: "e.g. Crop tighter around the two people and keep their hands.",
      refine: "Refine",
      refining: "refining…",
      feedbackApplied: "Feedback applied",
      feedbackFallback: "AI unavailable; local refinement applied",
      repairBlur: "Repair blur",
      repairingBlur: "repairing…",
      repairWarning: "Creates an AI-assisted version and may alter fine details.",
      generatedRepair: "AI REPAIR",
      blurRisk: "SHAKE / BLUR RISK",
    },
  },
  "zh-Hant": {
    languageButton: "EN",
    languageAria: "切換至英文",
    homeAria: "Precious Frame 首頁",
    theme: { dark: "暗色", light: "亮色", switchToDark: "切換至暗色模式", switchToLight: "切換至亮色模式" },
    labels: { vision: "AI", judge: "AI", newRun: "重新開始", ai: "AI", localFallback: "本機備援", visionAi: "AI 視覺判斷" },
    phase: { uploading: "擷取影片影格", extracting: "準備影格", loop1: "迴圈一／選擇影格", loop2: "迴圈二／改善修圖" },
    banners: { vision: "AI" },
    pipeline: { loop2Title: "修圖改善", loop2Note: "每輪只做一項受控修正，優先處理最低分軸向／門檻", loop2Tag: "迴圈 2" },
    footer: { assistant: "AI 視覺敘事助理", creator: "創辦與製作：" },
    landing: {
      editionPrototype: "2026 · 原型版本",
      editionLoop: "以迴圈工程打造視覺故事",
      editionTagline: "不要錯過任何影格",
      kicker: "視覺瞬間報告",
      title: "你的影片裡，藏著等待被找到的攝影作品。",
      slogan: "不要錯過任何影格。",
      dek: "我們不喜歡 AI 生成圖片。我們使用 AI 找出真實影片裡的照片：那些已經發生的瞬間，再依照你發布的場景挑選與修整。",
      startVideo: "從影片開始",
      readHow: "了解運作方式",
      capabilitiesAria: "Precious Frame 功能",
      capabilities: ["擷取", "選擇", "修整"],
      imageAlt: "影片影格接觸表，標出可成為完成照片的精彩瞬間",
      imageCaption: ["接觸表研究 no. 01", "從連續動態到有意識的一格"],
      newsLabel: "正在處理",
      newsCopy: "一段影片。數千個影格。一小組值得留下的畫面。",
      problemKicker: "問題",
      problemTitle: "最好的那一格，通常不會自己站出來。",
      problemParagraphs: ["短短一段影片，可能包含數千個表情、姿勢、構圖與光線變化。找出那張看起來像經過意圖安排的照片，仍然是一項緩慢的手工作業。", "Precious Frame 把影片當成接觸表來看待。它評估銳利度、曝光、對比、色彩、視覺趣味與多樣性，留下能共同成為一組作品的瞬間。"],
      problemQuote: "「現在，Precious Frame 能找出藏在影片裡最好的照片。」",
      methodKicker: "迴圈工程",
      methodTitle: "它不會在第一個答案就停下來。",
      methodDescription: "代理程式做出選擇、觀察結果、評分、套用一項受控修正，再重複這個流程，直到作品越過品質門檻或達到輪數上限。",
      methodCards: [
        { index: "01／接觸表", title: "擷取候選影格", copy: "把原始動態轉成視覺序列，同時保留每個候選瞬間的時間位置。" },
        { index: "02／迴圈一", title: "選出強度與多樣性", copy: "重新排列最有力的畫面，移除相近影格，讓最後的組圖不只說一個節拍。" },
        { index: "03／迴圈二", title: "評論並修整", copy: "一次只調整裁切、曝光、對比、飽和度、色溫或銳化其中一項決策。" },
      ],
      formulaAria: "Precious Frame 處理迴圈",
      formula: ["行動", "觀察", "評分", "修正", "重複"],
      usesKicker: "一個瞬間，多種去處",
      usesTitle: "為視覺故事真正會出現的地方而做。",
      usesDescription: "目前的原型會回傳一組完成度高的照片。下一步，是理解每個發布場景的視覺目的，並圍繞它調整輸出。",
      useItems: ["Instagram 貼文", "TikTok 縮圖", "YouTube 縮圖", "個人檔案照片", "精選封面", "宣傳素材"],
      futureKicker: "未來方向",
      futureTitle: "從視覺品質，走向個人視覺品味。",
      futureDescription: "一般品質只是起點。Precious Frame 將成長為理解「為什麼這張像你的照片，而另一張不是」的助理。",
      futureItems: [
        { number: "01", title: "個人美學模型", copy: "從收藏照片、偏好風格、過往修圖與互動模式中學習，理解什麼讓一張照片感覺像你。" },
        { number: "02", title: "進階風格轉換", copy: "把一個真實瞬間轉成 CCD、Y2K、底片、電影、編輯、迷因與平台專用版本。" },
        { number: "03", title: "智慧再利用", copy: "為 Instagram、TikTok、YouTube、個人檔案與宣傳活動準備合適的裁切、處理與視覺重點。" },
        { number: "04", title: "專業創意助理", copy: "支援照片篩選、批次建議、一致的風格比對、客戶偏好與更快的後期流程。" },
        { number: "05", title: "無處不在的照片智慧", copy: "以 SDK 形式把 Precious Frame 帶進相機 App、社群平台、創作者工具、運動、活動、回憶與旅遊產品。" },
      ],
      proKicker: "給工作的攝影師",
      proTitle: "把時間留給創作，少花時間整理。",
      proDescription: "Precious Frame 不打算取代攝影師的眼睛，而是成為重複工作的修圖夥伴：篩選、比較、檢查一致性，並準備第一版成果。",
      proItems: ["自動照片篩選", "批次修圖建議", "一致的風格比對", "客戶專屬偏好"],
      closingKicker: "下一個瞬間已經在那裡",
      closingTitle: "把動態變成值得記住的畫面。",
      uploadVideo: "上傳影片",
    },
    upload: { eyebrow: "開始一次處理", title: "上傳你的影片", description: "短 Reels、片段與精華影片最適合 Precious Frame。", drop: "把影片拖曳到這裡，或", browse: "瀏覽檔案", preferenceLegend: "你希望什麼讓影格脫穎而出？", bestShots: "最佳照片數", judged: "由 AI 評估影格，再由 Sharp 在本機完成修整。", run: "執行迴圈", working: "處理中…" },
    preferences: {
      balanced: { label: "均衡", description: "兼顧瞬間、故事、技術與構圖的全方位組合。" },
      "people-emotion": { label: "人物與情感", description: "表情、連結、姿態，以及無法重現的珍貴瞬間。" },
      competition: { label: "競賽標準", description: "專業影響力、有意識的取景、受控光線與完成度。" },
      "action-energy": { label: "動作與能量", description: "決定性動作、富表現力的身體位置與可讀的動態感。" },
      "scenic-composed": { label: "風景與構成", description: "光線、深度、幾何、氛圍與環境敘事。" },
    },
    infra: { stack: "處理技術堆疊", frameIntelligence: "影格智慧", selected: "已選擇", preference: "照片偏好", processing: "影片與影像處理", local: "本機", browserNote: "瀏覽器擷取真實影格；Sharp 套用裁切、色彩與細節調整。", api: "應用程式 API", standard: "標準", apiNote: "Express 處理影格，並透過單一 SSE 請求串流完整流程。" },
    loop1: { title: "影格選擇", clearedBar: "通過門檻", roundCap: "達到輪數上限", reranking: "重新排名…", round: "第" },
    loop2: { preparing: "準備中", clearedBar: "通過門檻", roundCap: "達到輪數上限", round: "第", scrub: "拖曳查看各輪", cached: "已快取" },
    output: {
      tag: "成果",
      title: "完成的照片組",
      winner: "最佳照片",
      save: "下載照片",
      edit: "編輯",
      closeEdit: "關閉編輯器",
      reset: "重設",
      brightness: "亮度",
      contrast: "對比",
      saturation: "色彩",
      feedback: "指示 AI 修整",
      feedbackHint: "描述你希望這張照片如何裁切或調整。",
      feedbackPlaceholder: "例如：裁切得更靠近兩個人，但保留他們的手部動作。",
      refine: "重新修整",
      refining: "修整中…",
      feedbackApplied: "已套用回饋",
      feedbackFallback: "AI 無法使用，已套用本機修整",
      repairBlur: "修復模糊",
      repairingBlur: "修復中…",
      repairWarning: "會產生 AI 輔助版本，細節可能有所改變。",
      generatedRepair: "AI 修復",
      blurRisk: "手震／模糊風險",
    },
  },
};
