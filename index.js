import fs from 'fs';
import path from 'path';
import protobuf from "./node_modules/protobufjs/minimal.js"
import { Buffer } from 'buffer'
import fetch from "node-fetch"
import chalk from 'chalk'


const { Writer, Reader } = protobuf

// 执行记录文件路径配置
const EXECUTION_RECORD_PATH = path.join(process.cwd(), 'ccc_execution_record_2.json');
const INTERVAL_12_HOURS = 12 * 60 * 60 * 1000; // 12小时
const INTERVAL_10_MINUTES = 10 * 60 * 1000; // 10分钟
let ret = []
logger.info(chalk.rgb(236, 92, 62)(`---------=.=---------`))
logger.info(chalk.rgb(56, 153, 228)(`互刷插件载入中`))
logger.info(chalk.rgb(35, 196, 116)(`作者：ZY&蛙蛙`))
logger.info(chalk.rgb(236, 92, 62)(`---------=.=---------`))
const appsDir = './plugins/WW-ccc-plugin/apps'
const files = fs
  .readdirSync(appsDir)
  .filter((file) => file.endsWith('.js'))

files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  let name = files[i].replace('.js', '')
  if (ret[i].status != 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}
export { apps }

class Protobuf {
  constructor() {}

  encode(obj) {
    const writer = Writer.create()
    for (const tag of Object.keys(obj).map(Number)) {
      const value = obj[tag]
      this._encode(writer, tag, value)
    }
    return writer.finish()
  }

  _encode(writer, tag, value) {
    switch (typeof value) {
      case "undefined":
        break
      case "number":
        writer.uint32((tag << 3) | 0).int32(value)
        break
      case "bigint":
        writer.uint32((tag << 3) | 0).int64(value)
        break
      case "string":
        writer.uint32((tag << 3) | 2).string(value)
        break
      case "boolean":
        writer.uint32((tag << 3) | 0).bool(value)
        break
      case "object":
        if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
          writer.uint32((tag << 3) | 2).bytes(value)
        } else if (Array.isArray(value)) {
          value.forEach(item => this._encode(writer, tag, item))
        } else if (value === null) {
          break
        } else {
          const nestedBuffer = this.encode(value)
          writer.uint32((tag << 3) | 2).bytes(nestedBuffer)
        }
        break
      default:
        throw new Error("Unsupported type: " + (value && typeof value))
    }
  }

  decode(buffer) {
    if (typeof buffer === 'string') buffer = Buffer.from(buffer, "hex")
    const result = {}
    const reader = Reader.create(buffer)
    while (reader.pos < reader.len) {
      const k = reader.uint32()
      const tag = k >> 3,
        type = k & 0b111
      let value
      switch (type) {
        case 0:
          value = this.long2int(reader.int64())
          break
        case 1:
          value = this.long2int(reader.fixed64())
          break
        case 2:
          value = Buffer.from(reader.bytes())
          try {
            value = this.decode(value)
          } catch {
            try {
              const decoded = value.toString('utf-8')
              const reEncoded = Buffer.from(decoded, 'utf-8')
              if (reEncoded.every((v, i) => v === value[i])) {
                value = decoded
              }
            } catch {
              // do nothing
            }
          }
          break
        case 5:
          value = reader.fixed32()
          break
        default:
          throw new Error("Unsupported wire type: " + type)
      }

      if (Array.isArray(result[tag])) {
        result[tag].push(value)
      } else if (!!result[tag]) {
        result[tag] = [result[tag]]
        result[tag].push(value)
      } else {
        result[tag] = value
      }
    }
    return result
  }

  long2int(long) {
    if (long.high === 0)
      return long.low >>> 0
    const bigint = (BigInt(long.high) << 32n) | (BigInt(long.low) & 0xffffffffn)
    const int = Number(bigint)
    return Number.isSafeInteger(int) ? int : bigint
  }
}

const pb = new Protobuf()
logger.mark('[ccc]插件加载');

// PHP API配置
const PHP_API_URL = 'http://zj.g18c.cn:11111/ccc.php';
let pb_add = (uin) => {
    return {"1":36984,"2":1,"4":{"1": uin},"6":"android 9.0.90"};
}
let Cmds = [
    "OidbSvcTrpcTcp.0x9078_1",
];
let icqq_uin = [];

// 存储定时器引用
let timers = {
    runTimer: null,
    hookTimer: null
};

// 检查并记录执行情况
const checkAndRecordExecution = async (selfId) => {
    try {
        // 获取当前日期(格式: YYYY-MM-DD)
        const today = new Date().toISOString().split('T')[0];
        
        // 读取执行记录文件
        let records = {};
        if (fs.existsSync(EXECUTION_RECORD_PATH)) {
            const content = fs.readFileSync(EXECUTION_RECORD_PATH, 'utf-8');
            records = JSON.parse(content) || {};
        }
        
        // 检查是否已执行
        const hasExecuted = records[selfId] === today;
        
        // 如果没有执行过，则记录
        if (!hasExecuted) {
            records[selfId] = today;
            fs.writeFileSync(EXECUTION_RECORD_PATH, JSON.stringify(records, null, 2));
        }
        
        return hasExecuted;
    } catch (e) {
        logger.mark('[ccc]检查执行记录错误：');
        logger.mark(e);
        return false; // 出错时默认未执行
    }
};

const Send = async (cmd, hex, uin, bot) => {
    if (bot?.adapter?.name === "OneBotv11") {
        let action = (bot?.version?.app_name === 'Lagrange.OneBot') ? '.send_packet' : 'send_packet';
        await bot.sendApi(action, { cmd, command: cmd, data: hex });
    } else {
        const buffer = Buffer.from(hex, "hex");
        await bot.sendUni(cmd, buffer);
    }
};

const SendMsg = async (cmd, bot_uin, uin, bot) => {
    if (bot?.adapter?.name === "OneBotv11") {
        await bot.sendApi("send_private_msg", {
            "user_id": bot_uin,
            "message": [
                {
                    "type": "text",
                    "data": {
                        "text": cmd
                    }
                }
            ]
        });
    } else {
        await bot.pickFriend(bot_uin).sendMsg(cmd);
    }
};

// 更新在线状态到PHP
const updateOnlineStatus = async (qq) => {
    try {
        const params = new URLSearchParams();
        params.append('action', '2');
        params.append('qq', qq);
        
        const response = await fetch(PHP_API_URL, {
            method: 'POST',
            body: params,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const result = await response.json();
        if (result.code !== 0) {
            logger.mark(`[ccc]更新在线状态失败: ${JSON.stringify(result)}`);
        }
    } catch (e) {
        logger.mark('[ccc]更新在线状态错误：');
        logger.mark(e);
    }
};

// 获取在线bot列表
const getOnlineBots = async (qq) => {
    try {
        const params = new URLSearchParams();
        params.append('action', '3');
        params.append('qq', qq);
        
        const response = await fetch(PHP_API_URL, {
            method: 'POST',
            body: params,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const result = await response.json();
        if (result.code === 0) {
            return result.data || [];
        } else {
            logger.mark(`[ccc]获取在线bot列表失败: ${JSON.stringify(result)}`);
            return [];
        }
    } catch (e) {
        logger.mark('[ccc]获取在线bot列表错误：');
        logger.mark(e);
        return [];
    }
};

Bot.on?.("connect", async(e) => {
    const currentBot = e?.bot || Bot[e?.self_id];
    const selfId = e?.self_id;
    
    if (currentBot?.adapter?.id != 'QQ') {
        return;
    }

    if (!currentBot || !selfId) {
        logger.mark('[ccc]连接事件中没有找到有效的bot或self_id');
        return;
    }

    // 清除可能存在的旧定时器
    if (timers.runTimer) clearInterval(timers.runTimer);
    if (timers.hookTimer) clearInterval(timers.hookTimer);
    
    // 立即执行hookOnline
    await hookOnline(currentBot, selfId);
    
    // 检查今日是否已执行过run函数
    const hasExecuted = await checkAndRecordExecution(selfId);
    if (!hasExecuted) {
        await run(currentBot, selfId);
    } else {
        logger.mark(`[ccc]今日已执行过run函数，QQ: ${selfId}，跳过执行`);
    }
    
    // 设置定时器
    timers.runTimer = setInterval(async () => { 
        const shouldRun = await checkAndRecordExecution(selfId);
        if (!shouldRun) {
            await run(currentBot, selfId); 
        }
    }, INTERVAL_12_HOURS);
    
    timers.hookTimer = setInterval(async () => { 
        await hookOnline(currentBot, selfId); 
    }, INTERVAL_10_MINUTES);
});

const hookOnline = async (bot, selfId) => {
    try {
        logger.mark(`[ccc]执行在线hook，更新QQ ${selfId} 的在线状态`);
        await updateOnlineStatus(selfId);
    } catch (e) {
        logger.mark('[ccc]hook在线错误：');
        logger.mark(e);
    }
};

async function run(bot, selfId) {
    try {
        // 先更新在线状态
        await updateOnlineStatus(selfId);
        
        // 获取在线bot列表
        const onlineBots = await getOnlineBots(selfId);
        logger.mark(`[ccc]获取到在线bot列表: ${JSON.stringify(onlineBots)}`);
        
        if (onlineBots.length === 0) {
            logger.mark('[ccc]没有在线的bot，跳过处理');
            return;
        }
        
        let hex = '';
        for (const bot_uin of onlineBots) {
            hex = Buffer.from(pb.encode(pb_add(Number(bot_uin)))).toString('hex')
            await Send(Cmds[0], hex, selfId, bot);
            await new Promise(resolve => setTimeout(resolve, 1e3));
            await SendMsg('菜单', bot_uin, selfId, bot);
            await new Promise(resolve => setTimeout(resolve, 6e3));
        }
    } catch (e) {
        logger.mark('[ccc]运行错误：')
        logger.mark(e)
    }
};

process.on('SIGINT', () => {
    if (timers.runTimer) clearInterval(timers.runTimer);
    if (timers.hookTimer) clearInterval(timers.hookTimer);
    process.exit();
});

process.on('SIGTERM', () => {
    if (timers.runTimer) clearInterval(timers.runTimer);
    if (timers.hookTimer) clearInterval(timers.hookTimer);
    process.exit();
});

logger.mark('[ccc]加载完成')
