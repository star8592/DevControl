(() => {
  const state = {
    catalog: null,
    project: null,
    action: 'plan'
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function el(id) { return document.getElementById(id); }

  function integration(key) {
    return state.catalog?.integrations?.find(item => item.key === key) || null;
  }

  function setOutput(text, kind = 'normal') {
    const output = el('integrationOutput');
    if (!output) return;
    output.className = `tool-output ${kind}`;
    output.textContent = String(text ?? '');
  }

  function openDrawer() {
    el('toolDrawer')?.classList.add('open');
    el('toolBackdrop')?.classList.add('open');
  }

  function closeDrawer() {
    el('toolDrawer')?.classList.remove('open');
    el('toolBackdrop')?.classList.remove('open');
  }

  async function callIntegration(payload) {
    const response = await fetch('/api/integration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadCatalog() {
    try {
      const response = await fetch('/api/integrations', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      state.catalog = data;
      return data;
    } catch (error) {
      console.error('integration catalog failed', error);
      return null;
    }
  }

  function renderHeader(project, title, subtitle) {
    el('toolProject').textContent = project?.name || project?.key || 'Project';
    el('toolTitle').textContent = title;
    el('toolSubtitle').textContent = subtitle || '';
  }

  function showLocalSetup(message) {
    const codex = integration('codex');
    const configured = codex ? `${codex.enabled ? 'enabled' : 'disabled'} · ${codex.mode} · ${(codex.capabilities || []).join(', ')}` : 'not registered';
    setOutput([
      message,
      '',
      `Codex registry: ${configured}`,
      '',
      '启用方式（本机，不修改 Git 仓库）：',
      '1. 确认：codex --version',
      '2. 必要时先完成 Codex 登录',
      '3. 编辑 ~/.config/devcontrol/integrations.json',
      '4. 将 integrations.codex.enabled 改为 true',
      '5. 保持 allowProjectPathsOnly=true、allowArbitraryShell=false',
      '6. systemctl --user restart devcontrol.service',
      '',
      '当前阶段仅开放 plan/review，并强制 read-only sandbox。'
    ].join('\n'), 'warn');
  }

  async function gitTool(project, action) {
    state.project = project;
    renderHeader(project, `Git · ${action}`, '只读本地 Git adapter；参数固定，不经过 shell。');
    el('copilotComposer').style.display = 'none';
    openDrawer();
    setOutput('正在读取本地仓库…');
    try {
      const data = await callIntegration({ integration: 'git', action, project: project.key });
      const text = data.stdout?.trim() || data.stderr?.trim() || (data.ok ? '无输出' : data.error || '执行失败');
      setOutput(`${text}\n\nrequest ${data.requestId || '—'}`, data.ok === false ? 'bad' : 'normal');
    } catch (error) {
      setOutput(`Git adapter 失败：${error.message}`, 'bad');
    }
  }

  function openCopilot(project, action = 'plan') {
    state.project = project;
    state.action = action;
    const labels = { plan: 'AI 规划', review: 'AI 审查' };
    renderHeader(project, labels[action] || 'AI Copilot', 'Codex 本地 CLI · 项目绑定 · supervised · read-only');
    el('copilotComposer').style.display = 'block';
    el('copilotPrompt').value = action === 'plan'
      ? `结合当前仓库和项目状态，规划最安全、最小可验证的下一步开发任务。`
      : `审查当前仓库状态和最近变更，优先找真实缺陷、回归、缺失测试和安全边界问题。`;
    el('copilotRun').textContent = labels[action] || '执行';
    setOutput('尚未执行。所有 AI 调用都会记录 request id，但不会把 prompt 写入审计日志。');
    openDrawer();
  }

  async function runCopilot() {
    const project = state.project;
    if (!project) return;
    const prompt = el('copilotPrompt').value.trim();
    if (!prompt) {
      setOutput('请输入任务说明。', 'warn');
      return;
    }
    const button = el('copilotRun');
    button.disabled = true;
    setOutput(`正在调用 Codex ${state.action}（read-only）…`);
    try {
      const data = await callIntegration({
        integration: 'codex',
        action: state.action,
        project: project.key,
        prompt
      });
      if (data.unavailable) {
        showLocalSetup(`Codex CLI 不可用：${data.error || 'not found'}`);
        return;
      }
      if (data.ok === false) {
        setOutput(`${data.error || 'Codex 执行失败'}\n\n${data.stderr || ''}\nrequest ${data.requestId || '—'}`, 'bad');
        return;
      }
      setOutput(`${data.stdout?.trim() || 'Codex 未返回文本'}\n\nrequest ${data.requestId || '—'}`);
    } catch (error) {
      if (error.status === 403 && /Integration disabled: codex/.test(error.message)) {
        showLocalSetup('Codex adapter 已安装，但当前本机配置默认关闭。');
      } else {
        setOutput(`AI 调用失败：${error.message}`, 'bad');
      }
    } finally {
      button.disabled = false;
    }
  }

  async function probeCodex(project) {
    state.project = project;
    renderHeader(project, 'Codex 本地探测', '只执行 codex --version，不进入项目写操作。');
    el('copilotComposer').style.display = 'none';
    openDrawer();
    setOutput('正在探测 Codex CLI…');
    try {
      const data = await callIntegration({ integration: 'codex', action: 'probe' });
      if (data.ok) {
        setOutput(`${data.stdout?.trim() || 'Codex CLI 已发现'}\n\n当前 adapter 默认仍可能处于 disabled；启用后仅开放 plan/review。\nrequest ${data.requestId || '—'}`);
      } else {
        showLocalSetup(`Codex CLI 探测失败：${data.error || 'unknown error'}`);
      }
    } catch (error) {
      setOutput(`Codex 探测失败：${error.message}`, 'bad');
    }
  }

  function copyOutput() {
    const text = el('integrationOutput')?.textContent || '';
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      const button = el('copyToolOutput');
      const original = button.textContent;
      button.textContent = '已复制';
      setTimeout(() => { button.textContent = original; }, 1200);
    }).catch(() => {});
  }

  window.DevIntegrations = {
    git: gitTool,
    copilot: openCopilot,
    probeCodex,
    reload: loadCatalog
  };

  window.addEventListener('DOMContentLoaded', () => {
    loadCatalog();
    el('toolClose')?.addEventListener('click', closeDrawer);
    el('toolBackdrop')?.addEventListener('click', closeDrawer);
    el('copilotRun')?.addEventListener('click', runCopilot);
    el('copyToolOutput')?.addEventListener('click', copyOutput);
    window.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
  });
})();
