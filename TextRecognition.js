// ==UserScript==
// @name:zh-CN   DeepSeek响应拦截器
// @name         DeepSeek Response Interceptor
// @namespace    https://github.com/Ahikl
// @version      2.0
// @description  该脚本用于拦截DeepSeek屏蔽提示，并输出已缓存文本，重新加载网页失效。
// @author       Ahikl
// @match        https://chat.deepseek.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
    "use strict";

    const BLOCKED_TEXT = "content_filter";
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

    // 重写 fetch 方法，拦截流式响应
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch(...args);
        if (!response.body) return response;

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
                        if (bufferedText.includes(BLOCKED_TEXT)) {
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

    // 重写 XMLHttpRequest 以拦截请求
    const originalXHR = window.XMLHttpRequest;

    function InterceptedXHR() {
        const xhr = new originalXHR();
        let bufferedResponse = "";
        xhr.addEventListener("readystatechange", function () {
            if (xhr.readyState === 3 || xhr.readyState === 4) {
                bufferedResponse = xhr.responseText;
                if (bufferedResponse.includes(BLOCKED_TEXT)) {
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

    // 监控 DOM 变化，确保动态插入的内容中不包含屏蔽文本
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
                        if (text && text.includes(BLOCKED_TEXT)) {
                            console.warn("MutationObserver 检测到屏蔽文本，触发回滚。");
                            rollbackContent();
                        }
                    });
                }
            }
        });
        observer.observe(container, {childList: true, subtree: true});
    }

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

    console.log("DeepSeek Response Interceptor脚本已注入，用于拦截流式响应并回滚屏蔽内容。");
})();