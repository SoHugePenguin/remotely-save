import {WrappedWebdavClient} from "./remoteForWebdav";
import {Notice} from "obsidian";


export const blockSize = 1024 * 1024 * 10;

export async function downloadByWebDav(client: WrappedWebdavClient, fileOrFolderPath: string)
  : Promise<ArrayBuffer> {
  let resultBuffer = new Uint8Array(); // 初始化一个空的 Uint8Array

  let blockCount = 0;
  let total = 0;
  await client.client.stat(fileOrFolderPath)
    .then(statResult => {
      if ('size' in statResult && 'ctime' in statResult && 'mtime' in statResult) {
        // 处理 FileStat 对象
        const blockCount = Math.ceil(statResult.size / blockSize);
      } else {
        // 处理 ResponseDataDetailed 对象或其他类型的响应
        total = "size" in statResult ? statResult.size : 0;
        blockCount = Math.ceil(total / blockSize)
      }
    })
    .catch(error => {
      console.error('获取统计信息时出错:', error);
    });

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    let requestOptions = {
      method: "GET",
      responseType: "arraybuffer",
      headers: {
        Range: `bytes=${blockIndex * blockSize}-${(blockIndex + 1) * blockSize - 1}`
      }
    };
    try {
      const response = await client.client.customRequest(fileOrFolderPath, requestOptions);
      if (response.data instanceof ArrayBuffer && response.data.byteLength > 0) {
        // 合并当前块到resultBuffer
        let currentBlock = new Uint8Array(response.data);
        let combined = new Uint8Array(resultBuffer.length + currentBlock.length);
        combined.set(resultBuffer);
        combined.set(currentBlock, resultBuffer.length);
        resultBuffer = combined;

        new Notice("文件下载: " + formatSize(resultBuffer.byteLength) + "/" + formatSize(total));
      } else {
        // 如果响应没有数据，跳出循环
        new Notice("我他妈下完辣！ " + "这个文件大概" + blockIndex + "MB再小一点的样子")
        break;
      }
    } catch (error) {
      console.log(error)
    }
  }

  return resultBuffer.buffer;
}

export function formatSize(size: number) {
  if (size < 1024) {
    return size + " B";
  } else if (size < 1048576) {
    return (size / 1024).toFixed(2) + " KB";
  } else if (size < 1073741824) {
    return (size / 1048576).toFixed(2) + " MB";
  } else return (size / 1073741824).toFixed(2) + " GB";
}

// 比较两个 ArrayBuffer 是否相同
export async function compareArrayBuffers(buffer1: ArrayBuffer, buffer2: ArrayBuffer): Promise<boolean> {
  const md5Hash1 = await calculateMD5(buffer1);
  const md5Hash2 = await calculateMD5(buffer2);
  return md5Hash1 === md5Hash2;
}

// 计算 ArrayBuffer 的 MD5 哈希值
async function calculateMD5(arrayBuffer: ArrayBuffer): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, "0")).join("");
}

