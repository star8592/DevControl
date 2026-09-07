(() => {
  const state = { catalog: null, project: null, action: 'plan', provider: 'codex' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const el = id => document.getElementById(id);
  const integration = key => state.catalog?.integrations?.find(item => item.key === key) || null;
  const providerLabel = key => ({ codex: 'Codex CLI', localModel: 'Local Model', openai: 'OpenAI API' }[key] || key);

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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
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

  function ensureProviderControls() {
    const composer = el('copilotComposer');
    const prompt = el('copilotPrompt');
    if (!composer || !prompt || el('copilotProvider')) return;
    const row = document.createElement('div');
    row.id = 'providerRow';
    row.style.cssText = 'display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;margin-bottom:10px';
    row.innerHTML = `
      <label for="copilotProvider" style="font-size:12px;color:#8fa0b5">AI Provider</label>
      <select id="copilotProvider" style="width:100%;background:#0d151f;border:1px solid #283447;border-radius:9px;color:#edf3fa;padding:9px 10px;outline:none"></select>
      <span style="font-size:11px;color:#8fa0b5">Context</span>
      <span id="providerHint" style="font-size:11px;color:#8fa0b5"></span>`;
    composer.insertBefore(row, prompt);
    el('copilotProvider')?.addEventListener('change', providerChanged);
  }

  function enabledAiProviders(action) {
    return ['codex', 'localModel', 'openai']
      .map(integration)
      .filter(item => item?.enabled && (item.capabilities || []).includes(action));
  }

  function providerContextDescription(provider) {
    const item = integration(provider);
    if (!item) return '';
    if (provider === 'codex') return '真实本地仓库 · read-only sandbox';
    if (provider === 'localModel') return `本地模型 · ${item.contextPolicy || 'bounded context'} · ${item.model || 'model 未配置'}`;
    if (provider === 'openai') return `远程 API · ${item.contextPolicy || 'bounded context'} · ${item.model || 'model 未配置'} · 显式付费 opt-in`;
    return item.contextPolicy || '';
  }

  function renderProviderOptions(action) {
    ensureProviderControls();
    const select = el('copilotProvider');
    if (!select) return;
    const enabled = enabledAiProviders(action);
    const choices = enabled.length ? enabled : ['codex', 'localModel', 'openai'].map(integration).filter(Boolean);
    select.innerHTML = choices.map(item => {
      const disabled = item.enabled ? '' : ' disabled';
      const suffix = item.enabled ? '' : '（disabled）';
      return `<option value="${esc(item.key)}"${disabled}>${esc(providerLabel(item.key))}${suffix}</option>`;
    }).join('');
    const preferred = enabled.find(item => item.key === state.provider)
      || enabled.find(item => item.key === 'codex')
      || enabled[0]
      || null;
    if (preferred) {
      state.provider = preferred.key;
      select.value = preferred.key;
    }
    const hint = el('providerHint');
    if (hint) hint.textContent = preferred ? providerContextDescription(preferred.key) : '没有已启用且支持此动作的 AI Provider。';
  }

  function showProviderSetup(provider, message) {
    const item = integration(provider);
    const configured = item ? `${item.enabled ? 'enabled' : 'disabled'} · ${item.mode} · ${(item.capabilities || []).join(', ')}` : 'not registered';
    const lines = [message, '', `${providerLabel(provider)} registry: ${configured}`, ''];
    if (provider === 'codex') {
      lines.push(
        '启用方式：',
        'bash scripts/configure-codex-readonly.sh probe',
        'bash scripts/configure-codex-readonly.sh enable',
        'systemctl --user restart devcontrol.service',
        '',
        'Codex 只开放 plan/review，并强制 read-only sandbox。'
      );
    } else if (provider === 'localModel') {
      lines.push(
        '本地模型要求：',
        '- endpoint 必须是 localhost / 127.0.0.1 / ::1',
        '- 在 ~/.config/devcontrol/integrations.json 配置 model',
        '- enabled=true 后重启 DevControl',
        '- 默认只发送项目元数据 + Git status/log/diff stat，不发送完整源码'
      );
    } else if (provider === 'openai') {
      lines.push(
        'OpenAI API 默认关闭，不会自动产生费用。启用需要：',
        '- ~/.config/devcontrol/integrations.json: openai.enabled=true',
        '- 配置 openai.model',
        '- 在 DevControl systemd 环境中配置 OPENAI_API_KEY',
        '- 重启 DevControl',
        '',
        '远程 API 默认只接收有限项目元数据与 Git 摘要，不自动上传源码或完整日志。'
      );
    }
    setOutput(lines.join('\n'), 'warn');
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

  async function openCopilot(project, action = 'plan') {
    state.project = project;
    state.action = action;
    if (!state.catalog) await loadCatalog();
    ensureProviderControls();
    const labels = { plan: 'AI 规划', review: 'AI 审查', chat: 'AI 对话', summarize: 'AI 摘要', triage: 'AI 分诊' };
    renderHeader(project, labels[action] || 'AI Copilot', 'Provider-neutral · 项目绑定 · 默认分析/只读');
    el('copilotComposer').style.display = 'block';
    renderProviderOptions(action);
    el('copilotPrompt').value = action === 'plan'
      ? '结合当前项目状态，规划最安全、最小可验证的下一步开发任务。'
      : action === 'review'
        ? '审查当前项目状态和最近变更，优先找真实缺陷、回归、缺失测试和安全边界问题。'
        : '分析当前项目并回答我的问题。';
    el('copilotRun').textContent = labels[action] || '执行';
    setOutput('尚未执行。所有 AI 调用都会记录 request id，但 prompt 不写入审计日志。');
    openDrawer();
  }

  async function runCopilot() {
    const project = state.project;
    if (!project) return;
    const prompt = el('copilotPrompt').value.trim();
    if (!prompt) return setOutput('请输入任务说明。', 'warn');
    const provider = el('copilotProvider')?.value || state.provider || 'codex';
    state.provider = provider;
    const providerConfig = integration(provider);
    if (!providerConfig?.enabled) return showProviderSetup(provider, `${providerLabel(provider)} 当前未启用。`);
    if (!(providerConfig.capabilities || []).includes(state.action)) return setOutput(`${providerLabel(provider)} 不允许 ${state.action}。`, 'warn');

    const button = el('copilotRun');
    button.disabled = true;
    setOutput(`正在调用 ${providerLabel(provider)} · ${state.action}…\n${providerContextDescription(provider)}`);
    try {
      const data = await callIntegration({ integration: provider, action: state.action, project: project.key, prompt });
      if (data.unavailable) return showProviderSetup(provider, `${providerLabel(provider)} 不可用：${data.error || 'not found'}`);
      if (data.ok === false) {
        return setOutput(`${data.error || 'AI 执行失败'}\n\n${data.stderr || ''}\nrequest ${data.requestId || '—'}`, 'bad');
      }
      const usage = data.usage?.totalTokens != null
        ? `\nusage: ${data.usage.totalTokens} tokens (in ${data.usage.inputTokens ?? '?'} / out ${data.usage.outputTokens ?? '?'})`
        : '';
      setOutput(`${data.stdout?.trim() || 'AI 未返回文本'}\n\nprovider ${providerLabel(provider)} · context ${data.contextPolicy || providerContextDescription(provider)}${usage}\nrequest ${data.requestId || '—'}`);
    } catch (error) {
      if (error.status === 403 && /Integration disabled:/.test(error.message)) showProviderSetup(provider, `${providerLabel(provider)} adapter 存在，但本机配置当前关闭。`);
      else setOutput(`AI 调用失败：${error.message}`, 'bad');
    } finally {
      button.disabled = false;
    }
  }

  async function probeProvider(project, provider = 'codex') {
    state.project = project;
    renderHeader(project, `${providerLabel(provider)} 探测`, '只执行 provider health/probe，不执行项目写操作。');
    el('copilotComposer').style.display = 'none';
    openDrawer();
    setOutput(`正在探测 ${providerLabel(provider)}…`);
    try {
      const data = await callIntegration({ integration: provider, action: 'probe' });
      if (!data.ok) return showProviderSetup(provider, `${providerLabel(provider)} 探测失败：${data.error || 'not ready'}`);
      const details = data.stdout?.trim()
        || (data.models?.length ? `models: ${data.models.join(', ')}` : JSON.stringify({ model: data.model || data.configuredModel || '', keyConfigured: data.keyConfigured }, null, 2));
      setOutput(`${details || `${providerLabel(provider)} 已发现`}\n\nrequest ${data.requestId || '—'}`);
    } catch (error) {
      setOutput(`${providerLabel(provider)} 探测失败：${error.message}`, 'bad');
    }
  }

  function providerChanged() {
    state.provider = el('copilotProvider')?.value || state.provider;
    const hint = el('providerHint');
    if (hint) hint.textContent = providerContextDescription(state.provider);
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
    probeCodex: project => probeProvider(project, 'codex'),
    probe: probeProvider,
    reload: loadCatalog
  };

  window.addEventListener('DOMContentLoaded', () => {
    ensureProviderControls();
    loadCatalog();
    el('toolClose')?.addEventListener('click', closeDrawer);
    el('toolBackdrop')?.addEventListener('click', closeDrawer);
    el('copilotRun')?.addEventListener('click', runCopilot);
    el('copyToolOutput')?.addEventListener('click', copyOutput);
    window.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
  });
})();
