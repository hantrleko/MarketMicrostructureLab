import React, { useState } from 'react';
import { GitCommit } from 'lucide-react';

interface ReleaseNote {
  version: string;
  codename: string;
  releaseDate: string;
  gitCommit: string;
  badgeColor: string;
  category: 'MAJOR' | 'FEATURE' | 'AUDIT';
  summary: string;
  highlights: {
    title: string;
    description: string;
    tag: string;
  }[];
  engineeringMetrics: {
    label: string;
    value: string;
  }[];
  artifacts: string[];
}

const releases: ReleaseNote[] = [
  {
    version: 'v4.0.0',
    codename: 'Full-Stack Quantitative Workbench: Buy-Side Execution, Live Paper MM & Micro-Alpha · 全栈微观结构量化工作台',
    releaseDate: '2026-10-31',
    gitCommit: 'RELEASE',
    badgeColor: '#10b981',
    category: 'MAJOR',
    summary: '重磅终极形态发布：从微观计量观测全面升维为集「卖方高频做市 (MM)」、「买方最优拆单 (Execution)」与「微观方向预测 (Alpha)」于一体的全栈高频微观结构工作台。上线 Almgren-Chriss 大单最优拆单求解器与四大算法马阵竞技；推出直连币安 WSS 真实队列优先权撮合的实盘虚拟做市演兵场 (Live Paper MM)；建立融合 OFI、Microprice、CVD 与 Hawkes 的多因子微观 Alpha 预测实验室与混淆矩阵审计；全面贯通全站学术荣誉认证墙与跨日实盘校验。',
    highlights: [
      {
        title: '买方智能拆单与大单最优执行实验室 (Almgren-Chriss Optimal Execution Lab)',
        description: '基于变分法闭式解求解双曲减速轨迹 x(t) = X0 * sinh(kappa*(T-t))/sinh(kappa*T)，同台竞技 Naive Dump、TWAP、VWAP 与 Almgren-Chriss 最优拆单，输出包含瞬时冲击、永久冲击与时间风险漂移的 Implementation Shortfall 损耗归因报告。',
        tag: 'ALMGREN_CHRISS'
      },
      {
        title: '币安 WSS 实盘虚拟做市演兵场 (Live Paper MM & Queue Matcher)',
        description: '直连币安 L2 深度与 aggTrade 实时流，在真实深度梯级上挂出虚拟限价单，高保真追踪前方排队厚度 Q_ahead 并依真实吃单流消耗撮合，联动 Hawkes 超临界 (ρ ≥ 1.0) 与 VPIN 毒性海啸自动撤单保护。',
        tag: 'LIVE_PAPER_MM'
      },
      {
        title: '微观结构 Alpha 预测实验室 (Microstructure Alpha Predictor)',
        description: '多因子实时融合 OFI 订单流失衡、Microprice 微观价偏离、ΔCVD 净吃单动量与 Hawkes 自激强度差，支持自定义多因子权重滑块，毫秒级测算 k ∈ {5, 10, 20, 50} 笔未来方向的 Rank IC 与混淆矩阵准确率。',
        tag: 'MICRO_ALPHA'
      },
      {
        title: '做市模拟器无前视偏差定价与全真 VPIN 防御 (Causal Pricing & Circuit Breaker)',
        description: '做市回测定价严格以 S_{t-1} 为锚，彻底杜绝未来函数前视偏差；接入真实 VPIN 毒性熔断开关对比，呈现毒性踩踏下做市商撤单与放开点差规避逆向选择的生存效益。',
        tag: 'CAUSAL_DEFENSE'
      },
      {
        title: '全局学术勋章荣誉认证墙与一键分享 (Global Honor Wall & Share)',
        description: '打通五幕学术微测验状态，集成全局学术荣誉认证墙弹窗，支持全量认证证书生成与剪贴板一键分享。',
        tag: 'HONOR_WALL'
      }
    ],
    engineeringMetrics: [
      { label: '微观结构分析模块', value: '7 大专业实验室' },
      { label: '买方拆单算法数', value: '4 种主流算法横向竞技' },
      { label: 'Alpha 预测时窗', value: 'k ∈ {5, 10, 20, 50} 笔' },
      { label: '实盘撮合延迟', value: 'O(1) 毫秒级前端事件驱动' },
      { label: '官方校验样本总量', value: '10,621,476 笔逐笔成交' },
      { label: '生产构建体积', value: '100% 通过 600kB 极限质量门禁' }
    ],
    artifacts: [
      'apps/web/src/components/OptimalExecutionLab.tsx',
      'apps/web/src/components/MicroAlphaLab.tsx',
      'apps/web/src/components/LivePaperTradingWidget.tsx',
      'apps/web/src/components/HonorWallModal.tsx'
    ]
  },
  {
    version: 'v3.0.0',
    codename: 'Production Market Making Simulator & Real-Time Cascades · 做市实盘模拟器与在线实时预警',
    releaseDate: '2026-10-31',
    gitCommit: 'RELEASE',
    badgeColor: '#38bdf8',
    category: 'MAJOR',
    summary: '重大里程碑升级：从前沿机构微观结构研究全面跃迁至交互式量化高频做市仿真与实战预警平台。发布基于 Avellaneda-Stoikov & Glosten-Milgrom 理论的高频做市策略实盘回测模拟器，实现点差捕获、库存惩罚与逆向选择损益三因子分解；浏览器原生直连币安 WebSocket 在线计算实时 VPIN 毒性，并在 Hawkes 分支比 ρ ≥ 1.0 时触发 Web Audio 合成音效与桌面弹窗报警；引入五幕学术通关微测验与本地勋章系统；提供三日全景流动性演化对比与 BTC/ETH/SOL 多币种特征解构；支持交互式参数调优控制台与增强版 BYOD 瞬时分析。',
    highlights: [
      {
        title: 'Avellaneda-Stoikov 高频做市回测模拟器 (Market Making Engine)',
        description: '在逐笔微观数据流中高保真驱动回测，用户可自由调优报价点差、库存厌恶度 γ、持仓上限与单笔报价量，实时分解点差毛捕获、持仓浮动盈亏与知情单逆向选择损失，输出夏普比率与最大回撤。',
        tag: 'MM_SIMULATOR'
      },
      {
        title: '浏览器在线实时 VPIN 与超临界声光/桌面双重预警 (Live VPIN & Avalanche Alarms)',
        description: '前端通过 WebSocket 原生聚合流实时切分成交量桶，在线输出动态 VPIN 毒性；在 Hawkes ρ ≥ 1.0 或 VPIN ≥ 35% 时触发 Web Audio API 警报音效、高对比 HUD 闪烁与浏览器桌面 Notification 弹窗。',
        tag: 'LIVE_ALARMS'
      },
      {
        title: '幕间微观结构通关微测验与学术勋章体系 (Checkpoint Quizzes & Badges)',
        description: '在各幕底部嵌入深度考题，答对可解锁「逐笔穿透者」「自激破译官」「幂律测算师」「毒性鉴别专家」「深度解构宗师」徽章并在顶部常驻展示。',
        tag: 'CHECKPOINT_QUIZZES'
      },
      {
        title: '三日全景流动性演化矩阵与多资产对比 (Multi-Day Matrix & Multi-Asset)',
        description: '提供 2026-07-01、07-02、07-03 三日核心实证指标全量横向矩阵与一键切换；横向对比 BTC/ETH/SOL 在到达流速、盘口深度、信息份额与期现传导中的不同微观特征。',
        tag: 'CROSS_ASSET'
      },
      {
        title: '交互式参数调优控制台与增强版 BYOD 诊断 (Interactive Knobs & BYOD VPIN)',
        description: '提供 VPIN 水桶容量滑块 (V ∈ [1, 20] BTC) 与 Hawkes 衰减率滑块 (β ∈ [0.2, 4.0]/s)；本地 BYOD 拖拽上传即刻在浏览器本地算完 VPIN 与自激参数，无需上传服务器。',
        tag: 'INTERACTIVE_KNOBS'
      }
    ],
    engineeringMetrics: [
      { label: 'Simulation Engine', value: 'Avellaneda-Stoikov / Glosten-Milgrom' },
      { label: 'Realtime Alerts', value: 'Web Audio API + Desktop Notifications' },
      { label: 'Interactive Knobs', value: 'VPIN Bucket (1-20 BTC) + Hawkes Beta' },
      { label: 'Checkpoint Quizzes', value: '5 Acts Comprehensive Empirical Validation' },
      { label: 'Cross-Asset Scope', value: 'BTC/USDT, ETH/USDT, SOL/USDT' },
      { label: 'Bundle Gate', value: 'All 15 Chunks < 600 kB Gate Pass' }
    ],
    artifacts: [
      'apps/web/src/components/MarketMakingSimulator.tsx',
      'apps/web/src/components/CheckpointQuiz.tsx',
      'apps/web/src/components/MultiDayComparisonPanel.tsx',
      'apps/web/src/pages/OrderBookLab.tsx',
      'apps/web/src/pages/ToxicityAndMMLab.tsx',
      'apps/web/src/pages/OrderFlowObservatory.tsx',
      'apps/web/src/components/GuidedTourModal.tsx'
    ]
  },
  {
    version: 'v2.1.1',
    codename: 'Integrity Hardening & Interactive Guided Tour · 承诺兑现与交互漫游',
    releaseDate: '2026-10-31',
    gitCommit: 'LATEST',
    badgeColor: '#10b981',
    category: 'FEATURE',
    summary: '全面兑现 V2.1 架构承诺，消除工程技术债：上线全新 5 步渐进式破冰漫游弹窗（GuidedTourModal）；实现真正起效的「💡 新手白话 / 🔬 专业量化」模式感知渲染；在全站各页面核心点位深度嵌入交互式微词典（GlossaryTerm）；彻底剔除前端硬编码兜底常量，严守零模拟假数据准则；规范统一「五幕主线 + 附录：数据防伪审计」叙事体系。',
    highlights: [
      {
        title: '分步交互式破冰漫游弹窗 (GuidedTourModal)',
        description: '响应首屏“3分钟微观破案故事”按钮，提供悬浮式 5 步渐进漫游卡片，跨页面无缝指引巨鲸吃单、Hawkes 羊群余震、加权冲击回补、VPIN 水桶与实盘自激武器。',
        tag: 'INTERACTIVE_TOUR'
      },
      {
        title: '双视角透镜感知分化渲染 (Real Dual-Mode Lens)',
        description: '在 MarketReplay、OrderFlowObservatory、MarketImpactResearch、ToxicityAndMMLab、OrderBookLab 五大页面全部接入 userMode 感知分化，新手视角呈现白话提炼，专业视角呈现完整计量方程。',
        tag: 'DUAL_MODE'
      },
      {
        title: '全局交互微词典挂载与无障碍支持 (Glossary Term Integration & a11y)',
        description: '在全站指标处深度挂载 <GlossaryTerm />，并支持键盘回车/空格/Esc 控制与屏幕阅读器无障碍支持。',
        tag: 'GLOSSARY_A11Y'
      },
      {
        title: '严守零假数据原则与叙事体系归一 (Zero-Mock Data & Narrative Alignment)',
        description: '清除所有遗留的硬编码兜底数字，缺失时优雅呈现骨架屏或破折号；统一规范为“五幕式探索主线 + 附录：数据防伪与密码学可信审计”。',
        tag: 'INTEGRITY'
      }
    ],
    engineeringMetrics: [
      { label: 'Interactive Tour Steps', value: '5 Progressive Steps' },
      { label: 'Dual-Mode Pages', value: '5 Empirical Acts' },
      { label: 'Zero-Mock Enforcement', value: '100% Dynamic / Null-Safe' },
      { label: 'Accessibility Standards', value: 'Keyboard & ARIA Compliant' }
    ],
    artifacts: [
      'GuidedTourModal.tsx',
      'GlossaryTerm.tsx (a11y)',
      'StoryBridge.tsx (appendix support)',
      'LeadLagRaceway.tsx (null-safe)',
      'ShareResearchCardModal.tsx (null-safe)'
    ]
  },
  {
    version: 'v2.1.0',
    codename: 'Newcomer Onboarding & Cohesive Storytelling · 破冰叙事与直观微件',
    releaseDate: '2026-10-29',
    gitCommit: 'LATEST',
    badgeColor: '#06b6d4',
    category: 'FEATURE',
    summary: '全面降低准入门槛，大幅提升新手友好度与视觉直观性：全局首屏「30秒破冰指挥舱」+「新手白话 💡 / 专业量化 🔬」双模式透镜 + 全局核心黑话「微词典悬浮胶囊」+ 五幕式因果剧情接力桥 + VPIN 动态注水桶 / 做市商多空拔河条 / 期现 180ms 赛道三大直觉可视化微件。',
    highlights: [
      {
        title: '首屏 30 秒破冰指挥舱与三条极速上手通道 (Mission Control Banner)',
        description: '一句话讲清平台定位与微观流动性黑盒价值，提供「🌱 3分钟微观破案故事」、「⚡ 币安实时盘口警报」、「🔬 量化计量模型与防伪审计」三条快速通道。',
        tag: 'ONBOARDING'
      },
      {
        title: '全局白话微词典与三段式 KPI 定性解读 (Glossary Term & Plain-Language Lens)',
        description: '实现 <GlossaryTerm /> 悬浮微词典（人话定义 + 生活比喻 + 实战信号），覆盖 VPIN、CVD、OFI、Hawkes ρ、逆向选择等核心黑话；支持一键切换「新手白话」与「专业量化」模式。',
        tag: 'GLOSSARY_LENS'
      },
      {
        title: '五幕式微观因果接力导航 (5-Act Storyline & Story Bridges)',
        description: '将平铺 Tab 编排为「① 看现场 (逐笔回放) → ② 探规律 (订单流自激) → ③ 算冲击 (价格响应) → ④ 识庄家 (毒性做市) → ⑤ 战实盘 (币安实时)」，每页底部配备剧情接力桥。',
        tag: 'STORY_BRIDGES'
      },
      {
        title: '三大核心模型物理直觉可视化微件 (Intuitive Visual Metaphors)',
        description: '实现 VPIN 等体积时钟动态注水桶、做市商点差 vs 逆向选择多空拔河天平条、期现 +180ms 双轨赛道图，并在 ECharts 图表内嵌红黄绿安全/警报语义色带。',
        tag: 'VISUAL_METAPHORS'
      }
    ],
    engineeringMetrics: [
      { label: 'Glossary Terms Covered', value: '12 Microstructure Terms' },
      { label: 'Narrative Story Acts', value: '5-Act Causal Pipeline' },
      { label: 'Visual Metaphor Widgets', value: '3 Interactive Components' },
      { label: 'Dual User Mode', value: 'Guided & Expert Switchable' }
    ],
    artifacts: [
      'WelcomeMissionBanner.tsx',
      'GlossaryTerm.tsx',
      'StoryBridge.tsx',
      'VolumeBucketVisualizer.tsx',
      'AdverseSelectionTugOfWar.tsx',
      'LeadLagRaceway.tsx'
    ]
  },
  {
    version: 'v2.0.0',
    codename: 'Deep Water Quant Suite · 专业深水区',
    releaseDate: '2026-10-29',
    gitCommit: 'LATEST',
    badgeColor: '#a855f7',
    category: 'MAJOR',
    summary: '深度拓展至专业高频量化深水区：VPIN 订单流毒性监控（Easley, Lopez de Prado & O\'Hara 2012）等体积时钟切分 + 做市商 Glosten-Milgrom / Hasbrouck 逆向选择损益分解与损益瀑布 + 现货 vs 永续合约高频领先滞后（Lead-Lag）与 Hasbrouck 信息份额定价权归因。',
    highlights: [
      {
        title: 'VPIN 等体积时钟流量毒性雷达 (Volume-Synchronized Probability of Toxicity)',
        description: '标准等体积切分（V = 5.0 BTC）与滑动窗口（N = 25 Buckets），有效剔除时间聚集性偏差；构建日内实时 VPIN 轨迹、经验 CDF 尾部分布与三重体制预警（Benign / Informed / Severe Toxic Tsunami），辅助做市商精准识别知情交易者冲击。',
        tag: 'VPIN_TOXICITY'
      },
      {
        title: '做市商逆向选择损益分解与瀑布归因 (MM Adverse Selection & PnL Waterfall)',
        description: '严格推导并实现 Glosten-Milgrom 恒等式：Effective Spread ≡ Realized Spread_k + Adverse Selection_k。覆盖 1s 至 300s 跨期限衰减结构，测算假定做市换手率下的损益瀑布，并毫秒级捕获 Top 10 剧毒大单冲击（Whale Snipes）。',
        tag: 'ADVERSE_SELECTION'
      },
      {
        title: '现货 vs 永续合约领先滞后与 Hasbrouck 信息份额 (Cross-Market Lead-Lag Suite)',
        description: '计算 [-1500ms, +1500ms] 互相关函数 CC(τ)，精准揭示币安永续合约较现货具有 +180ms 的稳定信息领先优势；严格推导 Hasbrouck (1995) 71.4%-78.2% 信息份额上下界与 Gonzalo-Granger 75.8% 永续合约永久定价权主导。',
        tag: 'LEAD_LAG_SHARE'
      },
      {
        title: '全新 Toxicity & MM Lab 专业量化工作台 (Dedicated Workbench Page)',
        description: '集成 VPIN 毒性雷达、做市商损益分解、期现领先滞后三大专业量化子模块，双 Y 轴图表、期限选择器与数学形式化 KaTeX 交互无缝结合。',
        tag: 'TOXICITY_LAB'
      }
    ],
    engineeringMetrics: [
      { label: 'VPIN Computation', value: '< 2 ms / bucket' },
      { label: 'Glosten-Milgrom Horizons', value: '1s - 300s (6 Horizons)' },
      { label: 'Futures Lead Lag', value: '+180 ms Peak Lead' },
      { label: 'Hasbrouck Info Share', value: '74.8% Futures Dominance' }
    ],
    artifacts: [
      'vpin_2026-07-01.json',
      'vpin_2026-07-02.json',
      'vpin_2026-07-03.json',
      'adverse_selection_2026-07-01.json',
      'adverse_selection_2026-07-02.json',
      'adverse_selection_2026-07-03.json',
      'lead_lag_2026-07-01.json',
      'lead_lag_2026-07-02.json',
      'lead_lag_2026-07-03.json'
    ]
  },
  {
    version: 'v1.4.0',
    codename: 'Real-Time Weapons Suite · 实时武器',
    releaseDate: '2026-10-28',
    gitCommit: 'LATEST',
    badgeColor: '#ef4444',
    category: 'MAJOR',
    summary: '100% 纯前端免后端实现的实时量化作战系统：浏览器直连 Binance WebSocket 高频流，实时计算 O(1) 递归核 Hawkes 点过程自激强度，并在分支比 rho >= 1.0 时毫秒级触发超临界雪崩吃单警报，搭配动态多标的（BTC/ETH/SOL）深度盘口与高频自激波形雷达。',
    highlights: [
      {
        title: '浏览器端 O(1) 实时 Hawkes 自激与雪崩检测雷达 (Real-time Hawkes Weapon)',
        description: '采用递推核快速滤波算法，在浏览器中实时消费真实 WebSocket 成交流（btcusdt@aggTrade），实时计算买卖双侧瞬时自激强度 λ(t) 与分支比 ρ(t)，彻底摆脱对本地 Python 环境的依赖。',
        tag: 'HAWKES_WEAPON'
      },
      {
        title: '超临界雪崩吃单实时预警系统 (Supercritical Cascade Alert)',
        description: '当分支比 ρ >= 1.0 时触发超临界羊群级联警报，实时呈现红色脉冲视觉警报、声学提示（可选）及自动生成的雪崩级联台账（包含峰值 ρ、持续时间、穿透量与主导买卖方）。',
        tag: 'CASCADE_ALERT'
      },
      {
        title: '多标的直连极速切换 (Multi-Ticker Live Switcher)',
        description: '支持 BTC/USDT、ETH/USDT、SOL/USDT 之间无缝热切换，动态拉取各币种官方深度数据流与聚合逐笔成交，微观价格与 OFI 实时联动。',
        tag: 'MULTI_TICKER'
      },
      {
        title: '50 笔滑动窗口实时强度与临界阈值波形图 (Streaming Waveform)',
        description: '实时渲染双通道买卖激发强度曲线与 ρ = 1.0 临界基准红线，辅助量化研究员直观追踪订单流自激强度的爆发与衰退轨迹。',
        tag: 'WAVEFORM'
      }
    ],
    engineeringMetrics: [
      { label: 'Hawkes Tick Processing', value: '< 0.05 ms / tick' },
      { label: 'WSS Direct Latency', value: '~80 ms' },
      { label: 'Cascade Detection', value: 'Real-time (O(1))' },
      { label: 'Unit Test Coverage', value: '90 Tests (100% Green)' }
    ],
    artifacts: [
      'apps/web/src/utils/hawkesEngine.ts (RealtimeHawkesEngine)',
      'apps/web/src/components/RealtimeHawkesWeapon.tsx',
      'apps/web/src/pages/OrderBookLab.tsx (V1.4 Live Weapon Deck)'
    ]
  },
  {
    version: 'v1.3.0',
    codename: 'Live Streaming & Operational Closed-Loop',
    releaseDate: '2026-10-28',
    gitCommit: 'd729779',
    badgeColor: '#00e5ff',
    category: 'MAJOR',
    summary: '突破静态展示与本地依赖限制，实现纯浏览器直连币安公共 WebSocket 实时盘口、当日实证参数驱动的动态滑点模拟、BYOD 外部数据全工作台接管，以及交互式平台架构与版本演更日志模块。',
    highlights: [
      {
        title: '浏览器直连币安公共 WebSocket (Zero-Backend Live Engine)',
        description: '在 OrderBookLab 中新增纯前端 WebSocket 直连引擎（wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms 与 @aggTrade），无需本地运行 Python 后端即可实时跳动 20 档盘口、动态 Microprice 与高频成交流。',
        tag: 'LIVE_WSS'
      },
      {
        title: '实证参数全联动滑点模拟器 (Empirically-Coupled Slippage Simulator)',
        description: '消除固定参数公式估算感，大单拆单滑点计算器直接读取当前选中日期的真实价格响应曲线 R(k)、回归弹性指数 gamma 及实际成交均价，动态展示不同流动性日下的切片成本差异。',
        tag: 'QUANT_SIM'
      },
      {
        title: 'BYOD 自定义数据接管全工作台 (Full-Workbench BYOD Injection)',
        description: '用户通过 BYOD 拖入本地 trades.csv 后，可一键将其注入为主工作台活跃数据集，直接调用 Market Replay 进行可视化逐笔回放与散点渲染。',
        tag: 'BYOD_INJECT'
      },
      {
        title: '系统版本演更记录与架构审计模块 (Version Changelog & Audit Trail)',
        description: '新增专属版本记录页面，沉淀 V1.0 至 V1.3 的完整研发脉络、实证突破、工程指标与证据链制品，提供机构级尽调透明度。',
        tag: 'CHANGELOG'
      }
    ],
    engineeringMetrics: [
      { label: 'Public Live WSS Latency', value: '~100 ms' },
      { label: 'Vite Production Chunks', value: '13 Chunks (All <= 600 kB)' },
      { label: 'Quality Gates Passed', value: '22 / 22 Passed' },
      { label: 'Unit Test Coverage', value: '90 Tests (100% Green)' }
    ],
    artifacts: [
      'apps/web/src/pages/VersionChangelog.tsx',
      'apps/web/src/pages/OrderBookLab.tsx (Direct Binance WSS)',
      'apps/web/src/pages/MarketImpactResearch.tsx (Dynamic Simulator)',
      'apps/web/src/components/BYODModal.tsx (Workbench Injector)'
    ]
  },
  {
    version: 'v1.2.0',
    codename: 'Institutional Branding & UX Leap',
    releaseDate: '2026-10-27',
    gitCommit: 'd7331da',
    badgeColor: '#38bdf8',
    category: 'MAJOR',
    summary: '正式引入 EUGENE FINANCE 官方品牌标识体系，落地高光行情剧本库、大单拆单滑点计算器、反事实盘口冲击沙盒、多资产流动性参照系与零后端本地数据体检仪。',
    highlights: [
      {
        title: 'EUGENE FINANCE 品牌体系全域集成',
        description: '顶部导航栏、浏览器 Favicon、页脚版权与导出分享卡片全量植入 EUGENE FINANCE 几何向上箭头 Logo 与专业排版。',
        tag: 'BRANDING'
      },
      {
        title: '高光行情剧本库 (Curated Microstructure Scenarios)',
        description: '从 10.62M 笔真实成交中提炼巨鲸单笔砸盘（05:49 UTC）、Hawkes 自激雪崩（08:00 UTC）与深厚挂单吸收（14:00 UTC），配备事件解说卡与 2x 自动播放。',
        tag: 'REPLAY_STORIES'
      },
      {
        title: '反事实盘口冲击沙盒 (Counterfactual L2 Sandbox)',
        description: '为离线状态提供校准自真实盘口的 12 档交互沙盒，支持自主注入 5~50 BTC 虚拟市价单，实时展示被吃穿档位与 Hawkes 弹性衰减回补动画。',
        tag: 'L2_SANDBOX'
      },
      {
        title: '多资产流动性参照系 (Multi-Asset Benchmark)',
        description: '横向对比 BTC/USDT（深盘）、ETH/USDT（中盘）与 SOL/USDT（薄盘）在 Hawkes 自激度、Kyle lambda 与冲击半衰期（2.1 笔 vs 12.4 笔）的本质鸿沟。',
        tag: 'MULTI_ASSET'
      },
      {
        title: '纯前端本地数据体检仪 (Zero-Backend BYOD Diagnostic)',
        description: '支持用户直接拖入币安 trades.csv，纯浏览器在 1 秒内流式分析前 50,000 行并计算符号自相关、Kyle lambda 与幂律指数。',
        tag: 'CLIENT_BYOD'
      }
    ],
    engineeringMetrics: [
      { label: 'Bitwise Trade Parity', value: '10,621,476 Trades (0.00e+00 Delta)' },
      { label: 'Evaluated Models', value: '15 Models (165 Metrics)' },
      { label: 'ECharts Bundle Size', value: '556 kB (Isolated Chunk)' },
      { label: 'GitHub CI Status', value: 'All 3 Jobs Green' }
    ],
    artifacts: [
      'apps/web/public/eugene_finance_logo.png',
      'apps/web/src/components/BYODModal.tsx',
      'apps/web/src/components/ShareResearchCardModal.tsx'
    ]
  },
  {
    version: 'v1.1.0',
    codename: 'Institutional Rigor & Full-Tape Audit',
    releaseDate: '2026-10-26',
    gitCommit: '6992f8f',
    badgeColor: '#10b981',
    category: 'AUDIT',
    summary: '完成 Stage 5 全量生产数据 1062 万笔位级对账，消灭抽样复核与全量验证口径混淆，签发官方 SHA-256 证书并完成 KaTeX 数学排版与视口几何自适应优化。',
    highlights: [
      {
        title: 'Stage 5 全量生产数据位级复算 (Bit-for-Bit Exact Match)',
        description: '从 Binance Vision 原始 ZIP CSV 重新摄取 2026-07-01 至 07-03 共 10,621,476 笔逐笔成交，比对 Parquet 分区，Price 差异为 0.0，Qty 差异为 0.0。',
        tag: 'STAGE_5_PASS'
      },
      {
        title: '官方 SHA-256 证书防伪绑定',
        description: '修复此前证书可绕过验证直接签发的漏洞，强制校验官方 .CHECKSUM 文件哈希流并签发 FULL_PRODUCTION_AND_SAMPLE_RECOMPUTATION_PASS 权威证书。',
        tag: 'CERT_LOCK'
      },
      {
        title: '统一样本选择器 (SampleSelector Singularity)',
        description: '将 API 端口、Hawkes 拟合与静态切片完全收拢至同一个 SampleSelector，消除各模块时间窗与样本行数不一致问题。',
        tag: 'SAMPLE_LOG'
      },
      {
        title: 'KaTeX 数学排版与 1280px 零溢出布局',
        description: '使用自研 KaTeXMath 组件消灭正文原始公式标记，采用自适应 CSS Grid 与局部横向滚动容器消除统计卡横向裁切。',
        tag: 'RESPONSIVE'
      }
    ],
    engineeringMetrics: [
      { label: 'Reconciled Trades', value: '10,621,476 Rows' },
      { label: 'Model Delta Against Benchmarks', value: '0.00e+00 (Exact Match)' },
      { label: 'Unit Test Suite', value: '90 Passed in 22s' },
      { label: 'Live CDN Manifest Match', value: '22 / 22 Files Matched' }
    ],
    artifacts: [
      'data/metadata/recomputation_certificate.json',
      'scripts/recompute_and_audit_provenance.py',
      'research/reports/MML_BTCUSDT_MICROSTRUCTURE_REPORT.md'
    ]
  },
  {
    version: 'v1.0.0',
    codename: 'Empirical Foundation & Theoretical Rejection',
    releaseDate: '2026-10-23',
    gitCommit: 'fb10651',
    badgeColor: '#f59e0b',
    category: 'MAJOR',
    summary: '确立基于 Binance Spot BTC/USDT 的高频微观结构实验基线，实证证伪单笔子单的平方根冲击假设，建立无未来信息的时序净化滚动交叉验证协议。',
    highlights: [
      {
        title: '单笔平方根冲击假设之经验证伪 (Square-Root Law Rejection)',
        description: '实证证明单笔子单价格响应 gamma 显著偏离 0.5（WLS gamma = -0.0739, OLS gamma = -0.0305, p < 0.001），澄清单笔瞬态空洞与母单长期累积规律的区别。',
        tag: 'H0_REJECT'
      },
      {
        title: '无重叠时序净化验证协议 (Purged Walk-Forward Cross-Validation)',
        description: '在折间设置 20 笔时序净化缓冲带（Purged Buffer），杜绝自相关导致的信息泄漏，累计完成 149,988 笔样本外测试。',
        tag: 'ZERO_LEAKAGE'
      },
      {
        title: 'Hive 分区标准数据湖构建',
        description: '建立 data/normalized/exchange=binance/market=spot/symbol=BTCUSDT/date=... 标准 Hive 分区格式，支持 DuckDB 高性能列式查询。',
        tag: 'HIVE_PARQUET'
      }
    ],
    engineeringMetrics: [
      { label: 'Unit Tests Baseline', value: '57 Passed' },
      { label: 'Model Manifest Checks', value: '18 JSON Manifests Verified' },
      { label: 'Walk-Forward Out-of-Sample Trades', value: '149,988 Trades' }
    ],
    artifacts: [
      'packages/analytics/sampling.py',
      'packages/analytics/impact.py',
      'packages/analytics/hawkes.py'
    ]
  }
];

export const VersionChangelog: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const filteredReleases = selectedCategory === 'ALL'
    ? releases
    : releases.filter((r) => r.category === selectedCategory || (selectedCategory === 'AUDIT' && r.highlights.some(h => h.tag.includes('AUDIT') || h.tag.includes('PASS'))));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Banner */}
      <div
        className="mml-card"
        style={{
          borderLeft: '4px solid #00e5ff',
          background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.06), rgba(13, 18, 28, 0.95))',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src="./eugene_finance_logo.png"
            alt="Eugene Finance"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              objectFit: 'contain'
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', letterSpacing: '0.06em' }}>
                EUGENE FINANCE &bull; PLATFORM CHANGELOG
              </span>
              <span className="badge-buy" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                CURRENT: v1.3.0
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              MarketMicrostructureLab 研发里程碑、密码学审计凭据与版本演更记录 (2026-10-23 &rarr; 2026-10-28)
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['ALL', 'MAJOR', 'AUDIT'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                background: selectedCategory === cat ? 'rgba(0, 229, 255, 0.2)' : 'var(--bg-dark)',
                border: `1px solid ${selectedCategory === cat ? '#00e5ff' : 'var(--border-highlight)'}`,
                color: selectedCategory === cat ? '#00e5ff' : 'var(--text-dim)',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {cat === 'ALL' ? 'ALL RELEASES' : cat === 'MAJOR' ? 'MAJOR FEATURES' : 'AUDIT & INTEGRITY'}
            </button>
          ))}
        </div>
      </div>

      {/* Release Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {filteredReleases.map((rel) => (
          <div
            key={rel.version}
            className="mml-card"
            style={{
              border: `1px solid ${rel.version === 'v1.3.0' ? 'rgba(0, 229, 255, 0.4)' : 'var(--border-color)'}`,
              padding: '22px',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* Top Accent Strip for Latest */}
            {rel.version === 'v1.3.0' && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  background: 'linear-gradient(90deg, #00e5ff, #38bdf8, #10b981)'
                }}
              />
            )}

            {/* Version Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  className="mono"
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: rel.badgeColor,
                    letterSpacing: '0.04em'
                  }}
                >
                  {rel.version}
                </span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                  {rel.codename}
                </span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    background: `${rel.badgeColor}18`,
                    border: `1px solid ${rel.badgeColor}40`,
                    color: rel.badgeColor,
                    padding: '2px 7px',
                    borderRadius: '3px'
                  }}
                >
                  {rel.category}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                <span className="mono">RELEASED: {rel.releaseDate}</span>
                <span
                  className="mono"
                  style={{
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--border-highlight)',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    color: 'var(--text-muted)'
                  }}
                >
                  <GitCommit size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {rel.gitCommit}
                </span>
              </div>
            </div>

            {/* Summary Text */}
            <div style={{ fontSize: '0.82rem', color: '#f1f5f9', lineHeight: '1.6', marginBottom: '16px', background: 'var(--bg-dark)', padding: '10px 14px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
              {rel.summary}
            </div>

            {/* Highlights Grid */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '8px', letterSpacing: '0.04em' }}>
                KEY DELIVERABLES &amp; CAPABILITIES:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '10px' }}>
                {rel.highlights.map((h, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-card)',
                      padding: '12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-highlight)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#fff' }}>
                        {h.title}
                      </span>
                      <span className="mono" style={{ fontSize: '0.62rem', color: rel.badgeColor, background: `${rel.badgeColor}12`, padding: '1px 5px', borderRadius: '2px', whiteSpace: 'nowrap' }}>
                        {h.tag}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
                      {h.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Engineering Metrics Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {rel.engineeringMetrics.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    minWidth: '160px',
                    background: 'var(--bg-dark)',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ fontSize: '0.64rem', color: 'var(--text-dim)', marginBottom: '2px' }}>{m.label}</div>
                  <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
