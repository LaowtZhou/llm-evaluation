# 大模型测评

## Agent + 大模型同题实战作品集

这里展示不同 Agent 与大模型组合面对同一道任务时，最后交付了什么。关注点是可打开、可检查的作品和工程材料：模型是否理解要求，Agent 是否能组织步骤、使用工具并把任务收敛成完整交付。

## 当前专题：3D体素场景测试

同题任务是制作“自然选择号”体素宇宙飞船全景网页：参考飞船视觉设定，用程序化体素表达舰体、居住环和推进结构，放入宇宙环境，并提供可观察场景的镜头或交互。每个 `test-*natural-selection-voxel` 目录是一组独立运行结果，目录名保留了对应模型版本。

| Agent + 模型 | 作品入口 | 可查材料 |
| --- | --- | --- |
| ChatGPT 5.6 Luna | [项目目录](./3D体素场景测试/test-ChatGPT-5.6-Luna-natural-selection-voxel/) · [构建页面](./3D体素场景测试/test-ChatGPT-5.6-Luna-natural-selection-voxel/dist/index.html) | [设计提示词](./3D体素场景测试/test-ChatGPT-5.6-Luna-natural-selection-voxel/DESIGN_PROMPT.md) · [参考图分析](./3D体素场景测试/test-ChatGPT-5.6-Luna-natural-selection-voxel/analysis.md) |
| ChatGPT 6 Luna | [项目目录与页面](./3D体素场景测试/test-ChatGPT-6-Luna-natural-selection-voxel/) · [使用说明](./3D体素场景测试/test-ChatGPT-6-Luna-natural-selection-voxel/README.md) | 场景源码、交互说明与运行要求 |
| DeepSeek V4.1 Flash | [项目目录](./3D体素场景测试/test-DeepSeek-V4.1-Flash-natural-selection-voxel/) · [单文件作品](./3D体素场景测试/test-DeepSeek-V4.1-Flash-natural-selection-voxel/自然选择号-体素全景.html) | [实现、验收与问题记录](./3D体素场景测试/test-DeepSeek-V4.1-Flash-natural-selection-voxel/README.md) · [验收截图](./3D体素场景测试/test-DeepSeek-V4.1-Flash-natural-selection-voxel/验收截图/) |
| Qwen 3.8 Flash | [项目目录与单文件作品](./3D体素场景测试/test-Qwen-3.8-flash-natural-selection-voxel/) | 独立 HTML 交付物 |
| SenseNova 6.8 Flash | [项目目录](./3D体素场景测试/test-sensenova-6.8-flash-natural-selection-voxel/) · [单文件作品](./3D体素场景测试/test-sensenova-6.8-flash-natural-selection-voxel/自然选择号-体素全景-顶级版.html) | 场景源码、构建脚本与本地依赖 |

### 相关但不同题的作品

[DeepSeek V4.1 Flash · 火山精灵龙](./3D体素场景测试/test-DeepSeek-V4.1-Flash-volcanic-elf-dragon/) 是另一道体素场景题，作为扩展示例保留；它不属于“自然选择号”同题比较组。

## 怎么看这组结果

建议先打开各组作品，再沿着同一条任务链比较：

1. **理解与还原**：飞船的长轴轮廓、居住环、舰脊和多组推进结构是否一眼可辨。
2. **体素表达**：体素是否真正构成主要形体，近看是否有结构层次，而非只在表面铺方块。
3. **构图与氛围**：镜头是否突出主体，宇宙背景、冷暖光和推进效果是否服务于飞船。
4. **交互与完成度**：能否顺畅环绕、切换观察角度，是否有明确的启动方式和错误反馈。
5. **Agent + 模型协作**：从任务拆解、文件与工具使用，到运行检查和返修，是否形成了可交付的完整项目。

本仓库以作品展示为主，不预设冠军。不同目录保留的提示词、Agent 配置、运行环境和验收材料并不完全一致；可以直接比较最终作品，但如果要给出严格排名或区分 Agent 与模型各自的贡献，应先补齐统一的运行记录和评分规则。

## 目录

- [3D体素场景测试](./3D体素场景测试/README.md)：同题作品入口、交付物清单与对比方式。
