import fetch from 'node-fetch'
//import { segment } from 'oicq'

export class BrushBind extends plugin {
  constructor () {
    super({
      name: '互刷绑定',
      dsc: '野机与官机互刷绑定及在线查询',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#?(绑定互刷|野机官机绑定)\\s+\\d+\\s+\\d+$',
          fnc: 'bindBot'
        },
     
        {
          reg: '^#?(查询在线互刷|在线互刷列表|在线野机列表)$',
          fnc: 'queryOnlineBots'
        },
       
        {
          reg: '^#?互刷帮助',
          fnc: 'showHelp'
        }
      ]
    })
  
    this.dataJsonUrl = 'http://zj.g18c.cn:11111/data.json'
  }


/**
   * 统一转发消息回复（所有文本合并为一条气泡）
   */
  async sendForwardMsg(e, msgs) {
    if (!Array.isArray(msgs)) msgs = [msgs]
   
    const text = msgs.join('\n')

    const forwardMsgs = [
      {
        message: [{ type: "text", text }],
        nickname: e.sender.card || e.sender.nickname || "互刷系统",
        user_id: e.user_id
      }
    ]

    try {
      const forward = await Bot.makeForwardMsg(forwardMsgs)
      await e.reply(forward)
    } catch (err) {
      await e.reply(text)
    }
  }

  /**
   * 显示帮助信息（新增在线查询说明）
   */
  async showHelp() {
    const helpMsg = `互刷绑定插件使用说明：
1. 绑定指令：#绑定互刷 [野机QQ号] [官机QQ号]
   示例：#绑定互刷 123456789 3889705200

2. 在线查询指令：#查询在线互刷（或#在线互刷列表、#在线野机列表）
   功能：查看当前在线的野机QQ及对应官机QQ

说明：
- 野机QQ号：需要绑定的野机账号（纯数字）
- 官机QQ号：对应的官机账号（纯数字）
- 发送指令后将自动向接口发送绑定请求
- 前往https://gitee.com/feixingwa/yunzai-qqbot-brushing安装插件`
    await this.sendForwardMsg(this.e, helpMsg)
  }


  async queryOnlineBots() {
    try {
      // 提示查询中
      await this.reply('正在查询在线互刷机器人，请稍候...')

      // 请求在线数据
      const response = await fetch(this.dataJsonUrl, {
        method: 'GET',
        timeout: 10000
      })
      if (!response.ok) {
        throw new Error(`接口请求失败，状态码：${response.status}`)
      }

      // 解析数据
      const data = await response.json()
      const { online = {}, bindings = {} } = data

      // 校验数据格式
      if (typeof online !== 'object' || typeof bindings !== 'object') {
        throw new Error('数据格式异常，无法解析在线信息')
      }

      // 处理在线列表（过滤非数字QQ，匹配官机）
      const onlineList = Object.entries(online)
        .filter(([yejiQQ]) => /^\d+$/.test(yejiQQ)) // 只保留数字QQ
        .map(([yejiQQ, timestamp]) => ({
          yejiQQ,
          guanjiQQ: bindings[yejiQQ] || '未绑定官机',
          onlineTime: this.formatTimestamp(timestamp)
        }))

      // 生成回复
      let replyMsg = []
      if (onlineList.length === 0) {
        replyMsg = ['📭 当前无在线互刷机器人']
      } else {
        replyMsg = [
          `✅ 共查询到 ${onlineList.length} 个在线互刷机器人：`,
          '------------------------'
        ]
        onlineList.forEach((item, i) => {
          replyMsg.push(
            `\n${i + 1}. 野机QQ：${item.yejiQQ}`,
            `   对应官机：${item.guanjiQQ}`,
            `   在线时间：${item.onlineTime}`
          )
        })
        replyMsg.push('\n------------------------\n提示：前往https://gitee.com/feixingwa/yunzai-qqbot-brushing获取更多功能')
      }
      // await this.reply(replyMsg)
     await this.sendForwardMsg(this.e, replyMsg)

    } catch (error) {
      console.error('在线互刷查询失败:', error)
      await this.reply(`❌ 在线查询失败：${error.message || '网络超时或接口异常'}`)
    }
  }

 
  formatTimestamp(timestamp) {
    // 处理秒级/毫秒级时间戳
    const ts = String(timestamp).length === 10 
      ? Number(timestamp) * 1000 
      : Number(timestamp)

    const date = new Date(ts)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-')
  }

  async bindBot () {
    const input = this.e.msg.trim()
    const qqNumbers = input.match(/\d+/g)

    if (!qqNumbers || qqNumbers.length !== 2) {
      await this.reply('输入格式错误！请使用：#绑定互刷 [野机QQ号] [官机QQ号]\n例如：#绑定互刷 123456789 3889705200\n发送#互刷帮助查看详细说明')
      return
    }

    const yejiQQ = qqNumbers[0]
    const guanjiQQ = qqNumbers[1]

    if (yejiQQ.length < 5 || yejiQQ.length > 13 || guanjiQQ.length < 5 || guanjiQQ.length > 13) {
      await this.reply('QQ号格式不正确，请检查后重试（QQ号应为5-13位数字）')
      return
    }

    try {
      await this.reply(`正在提交绑定请求...\n野机QQ：${yejiQQ}\n官机QQ：${guanjiQQ}`)

      const url = `http://zj.g18c.cn:11111/ccc.php?action=6&qq=${encodeURIComponent(yejiQQ)}&bot_uin=${encodeURIComponent(guanjiQQ)}`

      const response = await fetch(url, {
        method: 'GET',
        timeout: 10000
      })

      const resultText = await response.text()
      let result
      try {
        result = JSON.parse(resultText)
      } catch (e) {
        await this.reply([
          `❌ 接口返回格式异常`,
          `原始响应：${resultText.substring(0, 100)}${resultText.length > 100 ? '...' : ''}`
        ])
        return
      }

      let replyMsg = []
      switch(result.code) {
        case 0:
          replyMsg = [
            `✅ 绑定成功！\n`,
            `野机QQ：${yejiQQ}\n`,
            `官机QQ：${guanjiQQ}\n`,
            `接口信息：${result.message || '绑定已生效'}\n`,
            `前往https://gitee.com/feixingwa/yunzai-qqbot-brushing安装插件`
          ]
          break
        case -1:
          replyMsg = [
            `❌ 绑定失败：参数不全\n`,
            `请检查输入的QQ号是否完整\n`,
            `野机QQ：${yejiQQ}\n`,
            `官机QQ：${guanjiQQ}\n`
          ]
          break
        case -99:
          replyMsg = [
            `❌ 绑定失败：官机QQ被拉黑\n`,
            `官机QQ：${guanjiQQ}\n`,
            `该账号已被系统拉黑，无法进行绑定`
          ]
          break
        default:
          replyMsg = [
            `❌ 绑定失败（未知错误）\n`,
            `错误代码：${result.code || '无'}\n`,
            `错误信息：${result.message || '接口未返回具体原因'}\n请联系3345756927`
          ]
      }

      await this.sendForwardMsg(this.e, replyMsg)

    } catch (error) {
      console.error('互刷绑定接口调用失败:', error)
      await this.reply(`❌ 绑定请求失败：${error.message || '网络超时或接口异常'}`)
    }
  }
}
