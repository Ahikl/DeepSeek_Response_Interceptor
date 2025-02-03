// ==UserScript==
// @name:zh-CN   DeepSeek响应拦截器(文本识别版)
// @name         DeepSeek Response Interceptor(text recognition)
// @namespace    https://github.com/Ahikl
// @version      1.3
// @description  当检测到指定屏蔽文本时，终止流式响应并恢复上一次有效的输出
// @author       Ahikl
// @match        https://chat.deepseek.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
    "use strict";

    // 定义需要拦截的屏蔽文本
    const BLOCKED_TEXTS = [
        "检测到本次回复可能涉及不当内容，已启用安全保护机制。我们倡导健康文明的交流环境。",
        "你好，这个问题我暂时无法回答，让我们换个话题再聊聊吧。",
        "对不起，我还没有学会如何思考这类问题，我擅长数学、代码、逻辑类的题目，欢迎与我交流。",
        "我们始终遵循法律法规和伦理准则，倡导健康积极的交流环境。如果您有任何其他合法合规的咨询需求，我们将竭诚为您提供专业服务。",
        "我明白您希望继续这个虚构的角色扮演情景，但目前我无法提供此类包含成人内容的互动。如果您有其他话题或需要创作健康的故事框架，我很乐意协助您！ 😊",
        "出于安全方面的考虑，我恐怕无法完成您提到的这个任务。如果您有其他与学习、生活或娱乐相关的问题，我很愿意为您提供帮助。",
        "很抱歉，我无法继续参与这个对话。如果您有其他问题或需要帮助，请随时告诉我！"
    ];// 添加更多屏蔽文本

    // 用于记录上一次有效输出的内容，后续用于回滚
    let lastValidContent = "";
    const chatContainerSelector = ".chat-container";
    let chatContainer = null;

    // 尝试获取聊天容器
    function getChatContainer() {
        if (!chatContainer) {
            chatContainer = document.querySelector(chatContainerSelector);
        }
        return chatContainer;
    }

    // 更新上一次有效输出
    function updateLastValidContent() {
        const container = getChatContainer();
        if (container) {
            lastValidContent = container.innerHTML;
        }
    }

    // 回滚到上一次有效输出
    function rollbackContent() {
        const container = getChatContainer();
        if (container) {
            console.warn("检测到屏蔽文本，回滚到上一次有效内容。");
            container.innerHTML = lastValidContent;
        }
    }

    // 检查是否包含任何屏蔽文本
    function containsBlockedText(text) {
        return BLOCKED_TEXTS.some(blockedText => text.includes(blockedText));
    }

    // 重写 fetch 方法，拦截流式响应
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch(...args);
        if (!response.body) return response; // 非流式响应直接返回

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bufferedText = "";

        const newStream = new ReadableStream({
            start(controller) {
                function push() {
                    reader.read().then(({done, value}) => {
                        if (done) {
                            controller.close();
                            return;
                        }
                        const chunk = decoder.decode(value, {stream: true});
                        bufferedText += chunk;
                        // 检查是否包含屏蔽文本
                        if (containsBlockedText(bufferedText)) {
                            console.warn("Fetch 检测到屏蔽文本，终止流式响应。");
                            controller.close();
                            rollbackContent();
                            return;
                        }
                        controller.enqueue(value);
                        updateLastValidContent();
                        push();
                    }).catch(err => {
                        console.error("Fetch 处理异常:", err);
                        controller.error(err);
                    });
                }

                push();
            }
        });
        return new Response(newStream, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
        });
    };

    console.log("已重写 fetch 逻辑。");

    // 重写 XMLHttpRequest 以拦截请求
    const originalXHR = window.XMLHttpRequest;

    function InterceptedXHR() {
        const xhr = new originalXHR();
        let bufferedResponse = "";
        xhr.addEventListener("readystatechange", function () {
            // readyState 3: 正在接收数据；4: 请求结束
            if (xhr.readyState === 3 || xhr.readyState === 4) {
                bufferedResponse = xhr.responseText;
                if (containsBlockedText(bufferedResponse)) {
                    console.warn("XHR 检测到屏蔽文本，终止请求。");
                    xhr.abort();
                    rollbackContent();
                } else {
                    updateLastValidContent();
                }
            }
        });
        return xhr;
    }

    window.XMLHttpRequest = InterceptedXHR;
    console.log("已重写 XMLHttpRequest 逻辑。");

    // 使用 MutationObserver 监控 DOM 变化，确保动态插入的内容中不包含屏蔽文本
    function setupObserver() {
        const container = getChatContainer();
        if (!container) return;
        const observer = new MutationObserver((mutationsList) => {
            for (let mutation of mutationsList) {
                if (mutation.type === "childList") {
                    mutation.addedNodes.forEach((node) => {
                        let text = "";
                        if (node.nodeType === Node.TEXT_NODE) {
                            text = node.textContent;
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            text = node.innerText || "";
                        }
                        if (text && containsBlockedText(text)) {
                            console.warn("MutationObserver 检测到屏蔽文本，触发回滚。");
                            rollbackContent();
                        }
                    });
                }
            }
        });
        observer.observe(container, {childList: true, subtree: true});
        console.log("脚本已启动。");
    }

    // 定时检查目标容器是否加载完成，然后启动观察器
    function initObserver() {
        const interval = setInterval(() => {
            if (getChatContainer()) {
                updateLastValidContent();
                setupObserver();
                clearInterval(interval);
            }
        }, 1000);
    }

    window.addEventListener("load", initObserver);

    console.log("脚本已注入，用于拦截流式响应并回滚屏蔽内容。");
})();
