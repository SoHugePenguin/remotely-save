import {WrappedWebdavClient} from "./remoteForWebdav";
import {Notice} from "obsidian";


const blockSize = 1024 * 1024;

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
                console.log('文件大小:', statResult.size);
                console.log('创建时间:', statResult.ctime);
                console.log('最后修改时间:', statResult.mtime);
            } else {
                // 处理 ResponseDataDetailed 对象或其他类型的响应
                console.log('详细统计信息:', statResult);
                total = "size" in statResult ? statResult.size : 0;
                blockCount = Math.ceil(total / blockSize)
                console.log(blockCount)
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
                new Notice("已下载" + resultBuffer.byteLength + "，共" + total)
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
