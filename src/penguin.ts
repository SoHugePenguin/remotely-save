import {WrappedWebdavClient} from "./remote/remoteForWebdav";
import {Vault} from "obsidian";
import {baseNotice} from "./main";
import {decryptBase64urlToString} from "./encrypt";
import {normalizePath} from "./misc";


export const blockSize = 1024 * 1024 * 10;
export const sha256Length = 32;

class RemoteLocalInfo {
  blockCount = 0;
  total = 0;
  remoteFileOrFolderName = "";
  isSame = false;


  constructor(blockCount: number,
              total: number,
              remoteFileOrFolderName: string,
              isSame: boolean) {
    this.blockCount = blockCount;
    this.total = total;
    this.remoteFileOrFolderName = remoteFileOrFolderName;
    this.isSame = isSame;
  }
}

export async function downloadByWebDav(client: WrappedWebdavClient,
                                       fileOrFolderPath: string,
                                       vault: Vault,
                                       password: string)
  : Promise<ArrayBuffer> {
  const info = await verificationRemote(client, fileOrFolderPath, vault, password);

  let resultBuffer = new Uint8Array(); // 初始化一个空的 Uint8Array

  // 进度条
  for (let blockIndex = 0; blockIndex < info.blockCount; blockIndex++) {
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
        baseNotice.setMessage("文件下载: " + formatSize(resultBuffer.byteLength) + "/" + formatSize(info.total));
      }
    } catch (error) {
      console.log(error + "penguin1")
    }
  }
  return resultBuffer.buffer;
}


export async function verificationRemote(
  client: WrappedWebdavClient,
  fileOrFolderPath: string,
  vault: Vault,
  password: string): Promise<RemoteLocalInfo> {
  let isSame = false;
  let blockCount = 0;
  let total = 0;
  let remoteFileOrFolderName = "";
  await client.client.stat(fileOrFolderPath)
    .then(statResult => {
      if ('size' in statResult && 'ctime' in statResult && 'mtime' in statResult) {
        // 处理 FileStat 对象
        blockCount = Math.ceil(statResult.size / blockSize);
      } else {
        // 处理 ResponseDataDetailed 对象或其他类型的响应
        remoteFileOrFolderName = "basename" in statResult ? statResult.basename : "";
        total = "size" in statResult ? statResult.size : 0;
        blockCount = Math.ceil(total / blockSize)
      }
    })
    .catch(error => {
      if (error.status == '404') {
        console.log(fileOrFolderPath + "远程加密文件不存在(可能是本地有改动)！")
      } else console.error('获取统计信息时出错:', error);
    });

  // 判断md5是否和本地一致
  let requestOptions = {
    method: "GET",
    responseType: "arraybuffer",
    headers: {
      Range: `bytes=0-31`
    }
  };
  try {
    const trueFileOrFolderPath = await decryptBase64urlToString(remoteFileOrFolderName, password);
    const response = await client.client.customRequest(fileOrFolderPath, requestOptions);
    if (response.data instanceof ArrayBuffer &&
      response.data.byteLength > 0) {
      if (vault != undefined && await vault.adapter.exists(normalizePath(trueFileOrFolderPath))) {
        let localContent = await vault.adapter.readBinary(trueFileOrFolderPath);
        const sha256Value = await crypto.subtle.digest('SHA-256', localContent);
        const buffer1 = Buffer.from(response.data);
        const buffer2 = Buffer.from(sha256Value);
        isSame = buffer1.equals(buffer2);
      }
    }
  } catch (error) {
    console.error(error + "penguin2")
  }
  return new RemoteLocalInfo(blockCount, total, remoteFileOrFolderName, isSame);
}


export async function penguinUploadToRemote(
  client: WrappedWebdavClient,
  remoteUrl: string,
  fileToUpload: ArrayBuffer,
  fileName: string) {
  baseNotice.setMessage("正在上传: " + fileName + " size: " + formatSize(fileToUpload.byteLength))
  try {
    await client.client.putFileContents(remoteUrl, fileToUpload, {
      overwrite: true,
    });
  } catch (error) {
    console.error("上传错误：" + error);
  }
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
