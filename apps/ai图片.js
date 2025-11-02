import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import { Config } from '../config/index.js'
import { segment } from 'oicq'

export class AiDraw extends plugin {
  constructor () {
    super({
      name: 'AI绘画',
      dsc: '调用oiapi.net的AI绘画接口生成图片',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#?(AI绘画|ai绘画|生成|画画)(.*)$',
          fnc: 'drawImage'
        },
        {
          reg: '^#?(绘画帮助|ai帮助|生成图片帮助)$',
          fnc: 'showHelp'
        }
      ]
    })
  }

  /**
   * 显示帮助信息
   */
  async showHelp() {
    const helpMsg = `AI绘画插件使用说明：
指令：#AI绘画 [提示词] [风格:1-5,100] [尺寸:1-3] [智能补充:true/false]
示例：
#AI绘画 猫娘
#AI绘画 赛博朋克城市 风格:1 尺寸:2
#AI绘画 古风美女 风格:2 智能补充:false

风格说明：
1.现代都市 2.古风武侠 3.水墨国风 4.梦幻异世 5.现代日漫 100.智能匹配
尺寸说明：
1.1080*1080 2.1080*1512 3.1080*1920`
    await this.reply(helpMsg)
  }

  /**
   * 处理AI绘画指令
   */
  async drawImage () {
    // 提取用户输入的参数
    let input = this.e.msg.replace(/#?(AI绘画|ai绘画|生成图片|画画)/, '').trim()
    if (!input) {
      await this.reply('请提供绘画提示词，例如：#AI绘画 猫娘\n发送#AI绘画帮助查看详细用法')
      return
    }

    // 解析参数（格式：提示词 [风格:1-5,100] [尺寸:1-3] [智能补充:true/false]）
    let prompt = input
    let style = Config.aiDraw?.defaultStyle || 100
    let size = Config.aiDraw?.defaultSize || 2
    let llm = Config.aiDraw?.defaultLlm || true

    // 简单参数解析
    const styleMatch = input.match(/风格:(\d+)/)
    if (styleMatch && [1, 2, 3, 4, 5, 100].includes(Number(styleMatch[1]))) {
      style = Number(styleMatch[1])
      prompt = prompt.replace(styleMatch[0], '').trim()
    }

    const sizeMatch = input.match(/尺寸:(\d+)/)
    if (sizeMatch && [1, 2, 3].includes(Number(sizeMatch[1]))) {
      size = Number(sizeMatch[1])
      prompt = prompt.replace(sizeMatch[0], '').trim()
    }

    const llmMatch = input.match(/智能补充:(true|false)/)
    if (llmMatch) {
      llm = llmMatch[1] === 'true'
      prompt = prompt.replace(llmMatch[0], '').trim()
    }

    if (!prompt) {
      await this.reply('请提供有效的绘画提示词')
      return
    }

    try {
      // 发送请求中提示
      await this.reply('正在生成图片，请稍候...\n（通常会生成4张图片）')

      // 调用API
      const response = await fetch('https://oiapi.net/api/AiDrawImage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          style,
          size,
          llm,
          type: 'json'
        })
      })

      const result = await response.json()

      // 处理API返回结果（适配新的返回格式）
      if (result.code === 1 && result.data && result.data.length > 0) {
        // 构建回复内容
        const replyContent = [
          `🎨 提示词: ${prompt}`,
          `🖌️ 风格: ${this.getStyleName(style)}`,
          `📐 尺寸: ${this.getSizeName(size)}`,
          `💡 共生成 ${result.data.length} 张图片`
        ]

        // 添加所有图片
        result.data.forEach((img, index) => {
          if (img.url) {
            replyContent.push(`第${index + 1}张：`)
            replyContent.push(segment.image(img.url))
          }
        })

        // 发送生成的图片
        await this.reply(replyContent)
      } else {
        // 错误处理
        await this.reply(`生成失败: ${result.message || '未知错误'}`)
      }
    } catch (error) {
      console.error('AI绘画接口调用失败:', error)
      await this.reply('调用AI绘画接口失败，请稍后再试')
    }
  }

  /**
   * 获取风格名称
   */
  getStyleName (style) {
    const styles = {
      1: '现代都市',
      2: '古风武侠',
      3: '水墨国风',
      4: '梦幻异世',
      5: '现代日漫',
      100: '智能匹配'
    }
    return styles[style] || '智能匹配'
  }

  /**
   * 获取尺寸名称
   */
  getSizeName (size) {
    const sizes = {
      1: '1080*1080',
      2: '1080*1512',
      3: '1080*1920'
    }
    return sizes[size] || '1080*1512'
  }
}
    