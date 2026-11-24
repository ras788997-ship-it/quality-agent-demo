/*
 * 静态演示用接口模拟层。
 *
 * 这个文件只存在于公开展示仓库：把真实系统跑一遍后录下来的接口响应，
 * 按 (当前账号, 请求路径) 回放给前端。没有任何后端逻辑，也不含真实数据。
 *
 * 覆盖范围：登录 / 状态 / 权限 / 台账 / 报表 / 记忆 / 审计 / 访问申请 / 6 个示例问答。
 * 其余接口统一返回提示，不会伪造成功的业务结果。
 */
(function () {
  "use strict";

  var ROOT = new URL(".", location.href).toString();
  var realFetch = window.fetch.bind(window);
  var KEY = "qa_demo_user";
  var currentUser = localStorage.getItem(KEY) || "";
  var cache = Object.create(null);

  function loadJson(rel) {
    if (cache[rel]) return cache[rel];
    cache[rel] = realFetch(new URL(rel, ROOT).toString()).then(function (r) {
      if (!r.ok) throw new Error("missing " + rel);
      return r.json();
    }).catch(function (e) {
      delete cache[rel];
      throw e;
    });
    return cache[rel];
  }

  /** 取一个录好的响应；文件格式是 {status, body:"<原始 JSON 字符串>"} */
  function recorded(rel) {
    return loadJson("fixtures/" + rel).then(function (f) {
      var body = null;
      try { body = JSON.parse(f.body); } catch (e) { body = null; }
      return { status: f.status, body: body };
    });
  }

  function reply(status, obj) {
    return new Response(JSON.stringify(obj), {
      status: status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  function pass(rec) {
    if (!rec || !rec.body) return reply(500, { ok: false, error: "素材损坏" });
    return reply(rec.status, rec.body);
  }

  function setUser(name) {
    currentUser = name || "";
    if (currentUser) localStorage.setItem(KEY, currentUser);
    else localStorage.removeItem(KEY);
  }

  /** 账号级素材：当前账号没有的，退回到经理视角，保证页面不空白 */
  function userFile(name) {
    var u = currentUser || "zhangwei";
    return recorded("users/" + u + "/" + name + ".json").catch(function () {
      return recorded("users/zhangwei/" + name + ".json");
    });
  }

  var GET_MAP = {
    "/api/auth/me": "me",
    "/api/policy": "policy",
    "/api/status": "status",
    "/api/reports": "reports",
    "/api/ledger": "ledger",
    "/api/memory": "memory",
    "/api/audit": "audit",
    "/api/access/requests": "access-requests",
    "/api/demo/scenarios": "scenarios"
  };

  function genericAnswer(questions) {
    var lines = questions.map(function (q, i) {
      return (i + 1) + ". " + q.text;
    }).join("\n");
    return {
      ok: true,
      text: "**这是静态演示页**：回答来自预先录制的数据快照，只能演示下面 " +
        questions.length + " 个问题。\n\n" + lines +
        "\n\n想试别的，请克隆仓库在本地运行真实系统。",
      citations: [],
      confidence: 0,
      refused: true,
      intent: "search",
      elapsed_ms: 0,
      security: {}
    };
  }

  async function ask(body) {
    var q = String((body && body.question) || "").trim();
    var questions = await loadJson("fixtures/questions.json");
    var hit = null, i;
    for (i = 0; i < questions.length; i++) {
      if (questions[i].text === q) { hit = questions[i]; break; }
    }
    if (!hit) {
      for (i = 0; i < questions.length; i++) {
        if (q && (q.indexOf(questions[i].text) >= 0 || questions[i].text.indexOf(q) >= 0)) {
          hit = questions[i];
          break;
        }
      }
    }
    if (!hit) return reply(200, genericAnswer(questions));
    var rec;
    try {
      rec = await recorded("ask/" + (currentUser || "zhangwei") + "/" + hit.id + ".json");
    } catch (e) {
      rec = await recorded("ask/zhangwei/" + hit.id + ".json");
    }
    return pass(rec);
  }

  async function route(path, method, body) {
    // 登录 / 登出
    if (path === "/api/auth/demo-accounts") {
      return pass(await recorded("demo-accounts.json"));
    }
    if (path === "/api/auth/demo-login" || path === "/api/auth/login") {
      var name = String((body && body.username) || "").trim();
      var me;
      try {
        me = await recorded("users/" + name + "/me.json");
      } catch (e) {
        return reply(401, { ok: false, error: "账号不存在（静态演示只内置 6 个演示账号）" });
      }
      if (!me.body || !me.body.user) {
        return reply(401, { ok: false, error: "账号不存在" });
      }
      setUser(name);
      return reply(200, {
        ok: true, user: me.body.user, auth_enabled: true, demo_mode: true
      });
    }
    if (path === "/api/auth/logout") {
      setUser("");
      return reply(200, { ok: true });
    }

    // 未登录时，除登录相关接口外一律 401（和真实行为一致）
    if (!currentUser) {
      return reply(401, { ok: false, error: "unauthorized" });
    }

    // 问答
    if (path === "/api/ask" && method === "POST") {
      return ask(body);
    }

    // 台账记录查询
    if (path === "/api/ledger/records") {
      return pass(await userFile("ledger-records"));
    }

    // 只读接口
    if (method === "GET" && GET_MAP[path]) {
      return pass(await userFile(GET_MAP[path]));
    }

    // 写操作：回放录制的响应
    var POST_MAP = {
      "/api/access/request": "post/access-request.json",
      "/api/access/approve": "post/access-approve.json",
      "/api/ledger/sync": "post/ledger-sync.json",
      "/api/memory/clear": "post/memory-clear.json"
    };
    if (method === "POST" && POST_MAP[path]) {
      return pass(await recorded(POST_MAP[path]));
    }
    if (method === "POST" && path === "/api/demo/simulate-ledger-save") {
      return reply(200, { ok: true, message: "已模拟保存台账（静态演示，不会真的改数据）" });
    }
    if (method === "POST" && path === "/api/demo/reset") {
      return reply(200, { ok: true });
    }
    if (method === "POST" && path === "/api/ledger/restore") {
      return reply(200, { ok: true });
    }
    if (path === "/api/open") {
      return reply(200, { ok: false, error: "静态演示页不能打开本地文件" });
    }

    return reply(200, { ok: false, error: "静态演示未内置该接口：" + path });
  }

  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var abs = new URL(url, location.href);
    var path = abs.pathname;
    if (path.indexOf("/api/") !== 0) return realFetch(input, init);

    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var body = null;
    if (init && typeof init.body === "string") {
      try { body = JSON.parse(init.body); } catch (e) { body = null; }
    }
    return Promise.resolve(route(path, method, body)).catch(function (e) {
      return reply(500, { ok: false, error: "静态演示加载失败：" + (e && e.message ? e.message : e) });
    });
  };
})();
