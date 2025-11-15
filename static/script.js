// グローバル変数
let scanInterval = null;
let hostsData = {};

// ローカルホストかどうかを判定
function isLocalHost(host) {
    // localhostまたは127.x.x.x
    if (host === 'localhost' || host.startsWith('127.')) {
        return true;
    }
    // プライベートIPアドレス範囲をチェック
    const parts = host.split('.');
    if (parts.length === 4) {
        const first = parseInt(parts[0]);
        const second = parseInt(parts[1]);
        // 192.168.x.x
        if (first === 192 && second === 168) {
            return true;
        }
        // 10.x.x.x
        if (first === 10) {
            return true;
        }
        // 172.16.x.x ~ 172.31.x.x
        if (first === 172 && second >= 16 && second <= 31) {
            return true;
        }
    }
    return false;
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    console.log('LocalNetScan initialized');

    // イベントリスナーの設定
    document.getElementById('rescanBtn').addEventListener('click', startScan);

    // サンプルクリックで入力フィールドに設定
    document.querySelectorAll('.example-item').forEach(item => {
        item.addEventListener('click', function() {
            document.getElementById('targetRange').value = this.textContent;
        });
    });

    // Enterキーでスキャン開始
    document.getElementById('targetRange').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            startScan();
        }
    });

    // 初回データ取得
    loadResults();
    checkScanStatus();
});

// スキャンを開始
async function startScan() {
    const btn = document.getElementById('rescanBtn');
    const targetRangeInput = document.getElementById('targetRange');
    const targetRange = targetRangeInput.value.trim();

    btn.disabled = true;

    try {
        const requestBody = {};
        if (targetRange) {
            requestBody.target_range = targetRange;
        }

        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.status === 'success') {
            const message = targetRange
                ? `スキャンを開始しました: ${targetRange}`
                : 'スキャンを開始しました（自動検出）';
            showNotification(message, 'success');
            monitorScanProgress();
        } else {
            showNotification(data.message, 'error');
            btn.disabled = false;
        }
    } catch (error) {
        console.error('スキャン開始エラー:', error);
        showNotification('スキャン開始に失敗しました', 'error');
        btn.disabled = false;
    }
}

// スキャン進捗を監視
function monitorScanProgress() {
    const scanStatus = document.getElementById('scanStatus');
    scanStatus.classList.remove('hidden');

    // 既存のインターバルをクリア
    if (scanInterval) {
        clearInterval(scanInterval);
    }

    // 定期的にステータスをチェック
    scanInterval = setInterval(checkScanStatus, 1000);
}

// スキャンステータスをチェック
async function checkScanStatus() {
    try {
        const response = await fetch('/api/scan-status');
        const status = await response.json();

        const scanStatus = document.getElementById('scanStatus');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const rescanBtn = document.getElementById('rescanBtn');

        // nmapが利用できない場合は警告を表示
        if (status.nmap_available === false) {
            showNmapWarning(status.nmap_error);
            rescanBtn.disabled = true;
            return;
        }

        if (status.is_scanning) {
            scanStatus.classList.remove('hidden');
            progressBar.style.width = status.scan_progress + '%';
            progressText.textContent = `スキャン中... ${status.scan_progress}% (${status.current_subnet})`;
            rescanBtn.disabled = true;
        } else {
            scanStatus.classList.add('hidden');
            progressBar.style.width = '0%';
            rescanBtn.disabled = false;

            // スキャン完了時に結果を読み込み
            if (scanInterval) {
                clearInterval(scanInterval);
                scanInterval = null;
                loadResults();
            }

            // 最終スキャン時刻を更新
            if (status.last_scan_time) {
                document.getElementById('lastScanTime').textContent =
                    '最終スキャン: ' + status.last_scan_time;
            }
        }
    } catch (error) {
        console.error('ステータス取得エラー:', error);
    }
}

// nmapの警告を表示
function showNmapWarning(error) {
    const tbody = document.getElementById('hostsTableBody');
    tbody.innerHTML = `
        <tr class="no-data">
            <td colspan="5" style="padding: 40px; text-align: left;">
                <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px;">
                    <h3 style="color: #856404; margin-bottom: 15px;">⚠️ nmapがインストールされていません</h3>
                    <p style="color: #856404; margin-bottom: 10px;">
                        LocalNetScanを使用するには、システムにnmapをインストールする必要があります。
                    </p>
                    <div style="background: white; padding: 15px; border-radius: 4px; margin-top: 15px;">
                        <h4 style="color: #333; margin-bottom: 10px;">インストール方法:</h4>
                        <p style="color: #333; margin-bottom: 5px;"><strong>macOS:</strong></p>
                        <code style="background: #f5f5f5; padding: 5px 10px; border-radius: 3px; display: block; margin-bottom: 10px;">brew install nmap</code>

                        <p style="color: #333; margin-bottom: 5px;"><strong>Ubuntu/Debian:</strong></p>
                        <code style="background: #f5f5f5; padding: 5px 10px; border-radius: 3px; display: block; margin-bottom: 10px;">sudo apt-get update && sudo apt-get install nmap</code>

                        <p style="color: #333; margin-bottom: 5px;"><strong>Windows:</strong></p>
                        <p style="color: #666;">https://nmap.org/download.html からダウンロード</p>
                    </div>
                    <p style="color: #856404; margin-top: 15px; font-size: 0.9em;">
                        インストール後、アプリケーションを再起動してください。
                    </p>
                </div>
            </td>
        </tr>
    `;
}

// スキャン結果を読み込み
async function loadResults() {
    try {
        const response = await fetch('/api/results');
        const data = await response.json();

        hostsData = data.hosts;
        displayHosts(hostsData);

        // ホスト数を更新
        document.getElementById('hostCount').textContent =
            '検出ホスト数: ' + data.total;
    } catch (error) {
        console.error('結果取得エラー:', error);
    }
}

// ホスト一覧を表示（カード形式）
function displayHosts(hosts) {
    const container = document.getElementById('hostsContainer');
    container.innerHTML = '';

    if (Object.keys(hosts).length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">ホストが見つかりませんでした</div>';
        return;
    }

    for (const [ip, info] of Object.entries(hosts)) {
        const card = createHostCard(ip, info);
        container.appendChild(card);
    }
}

// ホストカードを作成
function createHostCard(ip, info) {
    const card = document.createElement('div');
    card.className = 'host-card';
    card.id = `host-${ip.replace(/\./g, '-')}`;

    card.innerHTML = `
        <div class="card-header" onclick="toggleCard('${ip}')">
            <div class="card-title">
                <h3>${ip}</h3>
                <span class="status-badge up">Online</span>
            </div>
            <span class="card-toggle" id="toggle-${ip.replace(/\./g, '-')}">▼</span>
        </div>
        <div class="card-body" id="body-${ip.replace(/\./g, '-')}">
            <!-- セクション1: PING/物理アクセス -->
            <div class="section">
                <div class="section-header">
                    <div class="section-title">
                        <span class="section-icon">📡</span>
                        物理アクセス
                    </div>
                </div>
                <div class="info-grid">
                    <span class="info-label">状態:</span>
                    <span class="info-value">✓ PING応答あり</span>
                    <span class="info-label">サブネット:</span>
                    <span class="info-value">${info.subnet || '-'}</span>
                </div>
            </div>

            <!-- セクション2: マシン情報 -->
            <div class="section">
                <div class="section-header">
                    <div class="section-title">
                        <span class="section-icon">💻</span>
                        マシン情報
                    </div>
                </div>
                <div class="info-grid">
                    <span class="info-label">ホスト名:</span>
                    <span class="info-value">${info.hostname || 'Unknown'}</span>
                    <span class="info-label">ベンダー:</span>
                    <span class="info-value">${info.vendor || '-'}</span>
                </div>
            </div>

            <!-- セクション3: ポートスキャン -->
            <div class="section">
                <div class="section-header">
                    <div class="section-title">
                        <span class="section-icon">🔌</span>
                        ポート情報
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-primary btn-small" onclick="openPortScanConfig('${ip}')">
                        ポートスキャン実行
                    </button>
                </div>
                <div id="ports-${ip.replace(/\./g, '-')}" class="ports-list" style="margin-top: 15px;">
                    <p style="color: #999; font-size: 0.9rem;">ポートスキャンを実行してください</p>
                </div>
            </div>
        </div>
    `;

    return card;
}

// カードの開閉（排他制御）
function toggleCard(ip) {
    const bodyId = `body-${ip.replace(/\./g, '-')}`;
    const toggleId = `toggle-${ip.replace(/\./g, '-')}`;
    const body = document.getElementById(bodyId);
    const toggle = document.getElementById(toggleId);

    const isCurrentlyExpanded = body.classList.contains('expanded');

    // 全てのカードを閉じる
    document.querySelectorAll('.card-body').forEach(b => {
        b.classList.remove('expanded');
    });
    document.querySelectorAll('.card-toggle').forEach(t => {
        t.classList.remove('expanded');
    });

    // クリックされたカードが閉じていた場合は開く
    if (!isCurrentlyExpanded) {
        body.classList.add('expanded');
        toggle.classList.add('expanded');
    }
}

// ポートスキャン設定モーダルを開く
let currentScanHost = null;

function openPortScanConfig(ip) {
    currentScanHost = ip;
    const modal = document.getElementById('portScanConfigModal');
    modal.classList.remove('hidden');

    // デフォルトのコマンドを設定
    document.getElementById('scanCommand').value = '-sT -sV';
}

// ポートスキャン設定モーダルを閉じる
function closePortScanConfig() {
    const modal = document.getElementById('portScanConfigModal');
    modal.classList.add('hidden');
    currentScanHost = null;
}

// ポートスキャンを実行
async function executePortScan() {
    if (!currentScanHost) {
        showNotification('スキャン対象ホストが指定されていません', 'error');
        return;
    }

    const scanCommand = document.getElementById('scanCommand').value.trim();
    if (!scanCommand) {
        showNotification('スキャンコマンドを入力してください', 'error');
        return;
    }

    // ホストを一時変数に保存（モーダルを閉じる前に）
    const targetHost = currentScanHost;

    // モーダルを閉じる
    closePortScanConfig();

    // タブUIを作成（初期表示から優先ポート・全ポートのタブを表示）
    createPortScanTabs(targetHost);

    try {
        const response = await fetch(`/api/port-scan/${targetHost}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                arguments: scanCommand
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification(data.message, 'success');
            // タブ内の進捗を更新
            updateTabProgress(targetHost, 'priority', 'started');
            updateTabProgress(targetHost, 'full', 'started');
            // ポーリングを開始して結果を取得
            pollPortScanResults(targetHost);
        } else {
            showNotification('ポートスキャンに失敗しました: ' + data.message, 'error');
            updateTabProgress(targetHost, 'priority', 'error');
            updateTabProgress(targetHost, 'full', 'error');
        }
    } catch (error) {
        console.error('ポートスキャンエラー:', error);
        showNotification('ポートスキャンに失敗しました', 'error');
        updateTabProgress(targetHost, 'priority', 'error');
        updateTabProgress(targetHost, 'full', 'error');
    }
}

// スキャン進捗を更新
function updateScanProgress(host, stage, command = '') {
    const progressDiv = document.getElementById(`scan-progress-${host.replace(/\./g, '-')}`);
    if (!progressDiv) return;

    let html = '';

    if (stage === 'started') {
        html = `
            <div><input type="checkbox" checked disabled> スキャン開始</div>
            <div><input type="checkbox" disabled> コマンド実行: nmap ${command}</div>
            <div><input type="checkbox" disabled> ポート検出中...</div>
        `;
    } else if (stage === 'detecting') {
        html = `
            <div><input type="checkbox" checked disabled> スキャン開始</div>
            <div><input type="checkbox" checked disabled> コマンド実行: nmap ${command}</div>
            <div><input type="checkbox" disabled> ポート検出中...</div>
        `;
    } else if (stage === 'analyzing') {
        html = `
            <div><input type="checkbox" checked disabled> スキャン開始</div>
            <div><input type="checkbox" checked disabled> コマンド実行完了</div>
            <div><input type="checkbox" checked disabled> ポート検出完了</div>
            <div><input type="checkbox" disabled> サービス情報取得中...</div>
        `;
    } else if (stage === 'complete') {
        html = `
            <div><input type="checkbox" checked disabled> スキャン開始</div>
            <div><input type="checkbox" checked disabled> コマンド実行完了</div>
            <div><input type="checkbox" checked disabled> ポート検出完了</div>
            <div><input type="checkbox" checked disabled> サービス情報取得完了</div>
            <div><input type="checkbox" checked disabled> 結果の解析完了</div>
        `;
    }

    progressDiv.innerHTML = html;
}

// タブUIを作成（優先ポート・全ポートのタブを初期表示）
function createPortScanTabs(host) {
    const portsDiv = document.getElementById(`ports-${host.replace(/\./g, '-')}`);
    const hostKey = host.replace(/\./g, '-');

    portsDiv.innerHTML = `
        <div class="port-scan-tabs" style="margin-top: 15px;">
            <!-- タブヘッダー -->
            <div class="tab-headers" style="display: flex; border-bottom: 2px solid #e2e8f0; margin-bottom: 15px;">
                <button class="tab-btn"
                        data-tab="priority"
                        onclick="switchTab('${host}', 'priority')"
                        style="flex: 1; padding: 12px 20px; background: #667eea; color: white; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: all 0.3s; margin-right: 5px;">
                    📌 優先ポート
                </button>
                <button class="tab-btn"
                        data-tab="full"
                        onclick="switchTab('${host}', 'full')"
                        style="flex: 1; padding: 12px 20px; background: #cbd5e0; color: #4a5568; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: all 0.3s;">
                    🔍 全ポート (1-65535)<br><span style="font-size: 0.75rem; font-weight: 400; opacity: 0.8;">🚀 並列6スレッド</span>
                </button>
            </div>

            <!-- タブコンテンツ -->
            <div class="tab-contents">
                <!-- 優先ポートタブ -->
                <div id="priority-tab-${hostKey}" class="tab-content" style="display: block;">
                    <div style="background: #f7fafc; padding: 15px; border-radius: 8px;">
                        <h4 style="margin: 0 0 10px 0; color: #4a5568;">📌 優先ポートスキャン進捗</h4>
                        <div id="priority-progress-${hostKey}" style="font-size: 0.9rem;">
                            <div><input type="checkbox" disabled> 優先ポートスキャン待機中...</div>
                        </div>
                    </div>
                    <div id="priority-results-${hostKey}" style="margin-top: 15px;"></div>
                </div>

                <!-- 全ポートタブ -->
                <div id="full-tab-${hostKey}" class="tab-content" style="display: none;">
                    <div style="background: #f7fafc; padding: 15px; border-radius: 8px;">
                        <h4 style="margin: 0 0 10px 0; color: #4a5568;">🔍 全ポートスキャン進捗</h4>
                        <div id="full-progress-${hostKey}" style="font-size: 0.9rem;">
                            <div><input type="checkbox" disabled> 🚀 並列スキャン待機中（6スレッド）...</div>
                        </div>
                        <div id="full-scan-progress-bar-container-${hostKey}" style="display: none; margin-top: 15px;">
                            <div style="width: 100%; background: #e2e8f0; border-radius: 4px; height: 8px; overflow: hidden;">
                                <div id="full-scan-progress-bar-${hostKey}"
                                     style="width: 0%; background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; transition: width 0.3s;"></div>
                            </div>
                            <div id="full-scan-progress-text-${hostKey}" style="margin-top: 8px; color: #718096; font-size: 0.85rem;">
                                🚀 高速並列スキャン実行中（6スレッド）...
                            </div>
                        </div>
                    </div>
                    <div id="full-results-${hostKey}" style="margin-top: 15px;"></div>
                </div>
            </div>
        </div>
    `;
}

// タブを切り替え
function switchTab(host, tabName) {
    const hostKey = host.replace(/\./g, '-');

    // 全てのタブボタンのスタイルをリセット
    const tabButtons = document.querySelectorAll(`#ports-${hostKey} .tab-btn`);
    tabButtons.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.style.background = '#667eea';
            btn.style.color = 'white';
        } else {
            btn.style.background = '#cbd5e0';
            btn.style.color = '#4a5568';
        }
    });

    // タブコンテンツの表示切り替え
    document.getElementById(`priority-tab-${hostKey}`).style.display =
        tabName === 'priority' ? 'block' : 'none';
    document.getElementById(`full-tab-${hostKey}`).style.display =
        tabName === 'full' ? 'block' : 'none';
}

// タブ内の進捗を更新
function updateTabProgress(host, tabName, stage, progressData = null) {
    const hostKey = host.replace(/\./g, '-');
    const progressDiv = document.getElementById(`${tabName}-progress-${hostKey}`);
    if (!progressDiv) return;

    const isLocal = isLocalHost(host);
    let html = '';

    if (stage === 'started') {
        html = `
            <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
            <div style="margin-bottom: 5px;"><input type="checkbox" disabled> コマンド実行中...</div>
        `;
    } else if (stage === 'detecting') {
        html = `
            <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
            <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> コマンド実行完了</div>
            <div style="margin-bottom: 5px;"><input type="checkbox" disabled> ポート検出中...</div>
        `;
    } else if (stage === 'analyzing') {
        if (isLocal) {
            html = `
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> コマンド実行完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> ポート検出完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" disabled> サービス情報取得中...</div>
            `;
        } else {
            // リモートスキャンの場合はサービス情報取得をスキップ
            html = `
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> コマンド実行完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> ポート検出完了</div>
                <div style="margin-bottom: 5px; color: #718096;"><input type="checkbox" disabled> リモートスキャンの為、サービス情報取得できません</div>
            `;
        }
    } else if (stage === 'complete') {
        if (isLocal) {
            html = `
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> コマンド実行完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> ポート検出完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> サービス情報取得完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> 結果の解析完了</div>
            `;
        } else {
            // リモートスキャンの場合はサービス情報取得をスキップ
            html = `
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> コマンド実行完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> ポート検出完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> 結果の解析完了</div>
            `;
        }
    } else if (stage === 'error') {
        html = `
            <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
            <div style="margin-bottom: 5px; color: #f56565;"><input type="checkbox" disabled> ❌ スキャン失敗</div>
        `;
    } else if (stage === 'scanning') {
        // 全ポートスキャン実行中（進捗％付き）- 6スレッド、2段階スキャン
        // progressDataから実際のスキャン数に基づく進捗を取得
        let estimatedProgress = 0;
        let scanPhase = '';
        let detailsText = '';

        if (progressData && progressData.progress) {
            const progress = progressData.progress;
            estimatedProgress = progress.overall_progress || 0;

            // 進捗率に基づいてフェーズを判定
            if (estimatedProgress < 50) {
                scanPhase = 'ポートスキャン';
                detailsText = `${progress.scanned_ports.toLocaleString()}/${progress.total_ports.toLocaleString()}ポート`;
            } else {
                scanPhase = 'サービス情報取得';
                detailsText = `${progress.service_scanned}/${progress.found_ports}ポート`;
            }
        } else {
            // フォールバック: progressDataがない場合は初期状態
            estimatedProgress = 0;
            scanPhase = 'ポートスキャン';
            detailsText = '0/65,535ポート';
        }

        // 進捗表示を2段階に分離（ローカル/リモートで表示を変更）
        if (estimatedProgress < 50) {
            html = `
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> コマンド実行完了</div>
                <div style="margin-bottom: 5px;"><input type="checkbox" disabled> 🚀 ポートスキャン実行中 (6スレッド並列)... ${estimatedProgress}%<br><span style="font-size: 0.85em; color: #718096;">${detailsText}</span></div>
                <div style="margin-bottom: 5px;"><input type="checkbox" disabled> ${isLocal ? 'サービス情報取得待機中 (6スレッド並列)...' : 'リモートスキャンの為、サービス情報取得できません'}</div>
            `;
        } else {
            if (isLocal) {
                html = `
                    <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
                    <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> コマンド実行完了</div>
                    <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> ✅ ポートスキャン完了 (6スレッド並列)</div>
                    <div style="margin-bottom: 5px;"><input type="checkbox" disabled> 🔍 サービス情報取得中 (6スレッド並列)... ${estimatedProgress}%<br><span style="font-size: 0.85em; color: #718096;">${detailsText}</span></div>
                `;
            } else {
                // リモートスキャンの場合
                html = `
                    <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> スキャン開始</div>
                    <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> コマンド実行完了</div>
                    <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> ✅ ポートスキャン完了 (6スレッド並列)</div>
                    <div style="margin-bottom: 5px; color: #718096;"><input type="checkbox" disabled> リモートスキャンの為、サービス情報取得できません</div>
                `;
            }
        }

        // プログレスバーを表示
        const progressBarContainer = document.getElementById(`${tabName}-scan-progress-bar-container-${hostKey}`);
        if (progressBarContainer) {
            progressBarContainer.style.display = 'block';
            const progressBar = document.getElementById(`${tabName}-scan-progress-bar-${hostKey}`);
            const progressText = document.getElementById(`${tabName}-scan-progress-text-${hostKey}`);
            if (progressBar) {
                progressBar.style.width = `${estimatedProgress}%`;
            }
            if (progressText) {
                progressText.textContent = `🚀 高速並列スキャン実行中（6スレッド）| ${scanPhase}: ${estimatedProgress}% | ${detailsText}`;
            }
        }
    }

    progressDiv.innerHTML = html;
}

// ポートスキャン結果をポーリング（並列スキャン対応・タブUI版）
async function pollPortScanResults(host) {
    const maxAttempts = 300; // 最大5分間ポーリング
    let attempts = 0;
    let priorityDisplayed = false;
    let fullDisplayed = false;
    let fullScanStartTime = null;

    const pollInterval = setInterval(async () => {
        attempts++;

        // 進捗ステージを更新（時間経過に基づく）
        if (attempts === 2) {
            updateTabProgress(host, 'priority', 'detecting');
            updateTabProgress(host, 'full', 'detecting');
        } else if (attempts === 5) {
            updateTabProgress(host, 'priority', 'analyzing');
        }

        try {
            const response = await fetch(`/api/port-scan/${host}`);
            const data = await response.json();

            if (data.status === 'success' && data.data) {
                const currentStage = data.data.scan_stage;
                const currentPorts = data.data.ports || [];

                // 優先ポートスキャン結果が来た場合
                if (currentStage === 'priority' && !priorityDisplayed) {
                    priorityDisplayed = true;
                    fullScanStartTime = attempts;
                    updateTabProgress(host, 'priority', 'complete');
                    displayPortResults(host, data.data, 'priority');
                }

                // 全ポートスキャン実行中の進捗％を更新（progressデータを使用）
                if (currentStage === 'full_scanning' && !fullDisplayed) {
                    if (!fullScanStartTime) fullScanStartTime = attempts;
                    // 実際の進捗データを渡す
                    updateTabProgress(host, 'full', 'scanning', data.data);
                }

                // 全ポートスキャン結果が来た場合
                if (currentStage === 'full' && !fullDisplayed) {
                    fullDisplayed = true;
                    updateTabProgress(host, 'full', 'complete');
                    displayPortResults(host, data.data, 'full');
                    clearInterval(pollInterval);
                }
            } else if (attempts >= maxAttempts) {
                // タイムアウト
                updateTabProgress(host, 'priority', 'error');
                updateTabProgress(host, 'full', 'error');
                clearInterval(pollInterval);
            }
        } catch (error) {
            console.error('結果取得エラー:', error);
            if (attempts >= maxAttempts) {
                updateTabProgress(host, 'priority', 'error');
                updateTabProgress(host, 'full', 'error');
                clearInterval(pollInterval);
            }
        }
    }, 1000); // 1秒ごとにチェック
}

// ポート結果を表示（タブUI版・優先ポートと全ポートを各タブ内に表示）
async function displayPortResults(host, data, stage = 'full') {
    const hostKey = host.replace(/\./g, '-');
    const resultsDiv = document.getElementById(`${stage}-results-${hostKey}`);

    if (!resultsDiv) {
        console.error(`結果表示エリアが見つかりません: ${stage}-results-${hostKey}`);
        return;
    }

    if (!data || !data.ports || data.ports.length === 0) {
        resultsDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem; padding: 10px; background: #f7fafc; border-radius: 6px;">開いているポートが見つかりませんでした</p>';
        return;
    }

    // プロセス情報を取得
    let processInfo = {};
    let isLocalHost = false;
    let processInfoStatus = 'loading';
    try {
        const response = await fetch(`/api/process-info/${host}`);
        if (response.ok) {
            const processData = await response.json();
            if (processData.status === 'success') {
                processInfo = processData.data || {};
                isLocalHost = !processData.note; // noteがない場合はローカルホスト
                processInfoStatus = isLocalHost ? 'available' : 'remote';
            }
        }
    } catch (error) {
        console.error('プロセス情報取得エラー:', error);
        processInfoStatus = 'error';
    }

    let html = '';

    // OS情報（全ポートスキャン時のみ表示）
    if (stage === 'full' && data.os) {
        html += `<div style="background: #f7fafc; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
            <strong>🖥️ OS:</strong> ${data.os}
        </div>`;
    }

    // 検出されたポート数を表示
    const openPorts = data.ports.filter(p => p.state === 'open').length;
    html += `<div style="background: #e6fffa; color: #234e52; padding: 10px; border-radius: 6px; margin-bottom: 15px; font-weight: 600;">
        ✅ ${openPorts}個の開いているポートを検出しました
    </div>`;

    // ポートリスト
    data.ports.forEach(port => {
        const stateClass = port.state === 'open' ? '' : 'closed';
        const version = port.version ? `${port.product} ${port.version}` : port.product || '';
        const portKey = `${port.port}/${port.protocol}`;
        const process = processInfo[portKey];

        html += `
            <div class="port-item ${stateClass}" style="background: white; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid ${port.state === 'open' ? '#48bb78' : '#cbd5e0'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div>
                            <span class="port-number" style="font-weight: 700; color: #2d3748; font-size: 1rem;">${port.port}/${port.protocol}</span>
                            <span class="port-service" style="color: #4a5568; margin-left: 10px; background: #edf2f7; padding: 3px 8px; border-radius: 4px; font-size: 0.85rem;">${port.service || 'unknown'}</span>
                            ${port.state !== 'open' ? `<span style="color: #f56565; font-size: 0.85rem; margin-left: 8px;">(${port.state})</span>` : ''}
                        </div>
                        ${version ? `<div style="color: #666; font-size: 0.85rem; margin-top: 5px;">📦 ${version}</div>` : ''}
                        ${process ? `
                            <div style="margin-top: 8px; font-size: 0.85rem; color: #4a5568; background: #f7fafc; padding: 6px 10px; border-radius: 4px; display: inline-block;">
                                <strong>PID:</strong> ${process.pid} |
                                <strong>プロセス:</strong> ${process.name || 'unknown'}
                            </div>
                        ` : ''}
                    </div>
                    ${process && process.pid ? `
                        <button class="btn-kill" onclick="killProcess(${process.pid}, '${host}', ${port.port})"
                                style="padding: 8px 16px; background: #f56565; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.2s; margin-left: 15px; box-shadow: 0 2px 4px rgba(245, 101, 101, 0.3);"
                                onmouseover="this.style.background='#e53e3e'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(245, 101, 101, 0.4)';"
                                onmouseout="this.style.background='#f56565'; this.style.transform=''; this.style.boxShadow='0 2px 4px rgba(245, 101, 101, 0.3)';">
                            ⚠️ KILL
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    resultsDiv.innerHTML = html;

    // プロセス情報取得完了のチェックボックスを更新（ローカルホストの場合のみ）
    if (isLocalHost && processInfoStatus === 'available') {
        const progressDiv = document.getElementById(`${stage}-progress-${hostKey}`);
        if (progressDiv) {
            progressDiv.innerHTML += `
                <div style="margin-bottom: 5px;"><input type="checkbox" checked disabled> プロセス情報取得完了</div>
            `;
        }
    }
}

// プロセスをKILL
async function killProcess(pid, host, port) {
    if (!confirm(`警告: PID ${pid} (ポート ${port}) のプロセスを終了しますか？\n\nこの操作は元に戻せません。`)) {
        return;
    }

    try {
        const response = await fetch(`/api/kill-process/${pid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification(`プロセス ${pid} を終了しました`, 'success');

            // 該当のポートアイテムを見つけてグレーアウト
            greyOutKilledPort(host, port, pid);
        } else {
            showNotification('プロセスの終了に失敗しました: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('プロセス終了エラー:', error);
        showNotification('プロセスの終了に失敗しました', 'error');
    }
}

// KILLしたポートをグレーアウト表示
function greyOutKilledPort(host, port, pid) {
    // 全てのport-itemを検索して該当のポートを見つける
    const portsContainers = document.querySelectorAll(`#ports-${host.replace(/\./g, '-')} .port-item`);

    portsContainers.forEach(portItem => {
        const portNumberElement = portItem.querySelector('.port-number');
        if (portNumberElement && portNumberElement.textContent.startsWith(`${port}/`)) {
            // グレーアウトスタイルを適用
            portItem.style.opacity = '0.5';
            portItem.style.background = '#f5f5f5';
            portItem.style.borderLeft = '3px solid #cbd5e0';
            portItem.style.paddingLeft = '12px';
            portItem.style.transition = 'all 0.3s ease';

            // KILLボタンを「終了済み」バッジに置き換え
            const killButton = portItem.querySelector('.btn-kill');
            if (killButton) {
                killButton.outerHTML = `
                    <span style="padding: 6px 14px; background: #a0aec0; color: white; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">
                        ✓ 終了済み
                    </span>
                `;
            }

            // プロセス情報の部分に取り消し線を追加
            const processInfoDiv = portItem.querySelector('div[style*="background: #f7fafc"]');
            if (processInfoDiv) {
                processInfoDiv.style.textDecoration = 'line-through';
                processInfoDiv.style.opacity = '0.6';
            }
        }
    });
}

// モーダルを閉じる（互換性のため残す）
function closeModal() {
    closePortScanConfig();
}

// sudoパスワードモーダルを開く
function openSudoPasswordModal() {
    const modal = document.getElementById('sudoPasswordModal');
    modal.classList.remove('hidden');
}

// sudoパスワードモーダルを閉じる
function closeSudoPasswordModal() {
    const modal = document.getElementById('sudoPasswordModal');
    modal.classList.add('hidden');
    document.getElementById('sudoPassword').value = '';
}

// sudoパスワードを保存
async function saveSudoPassword() {
    const password = document.getElementById('sudoPassword').value;

    if (!password) {
        showNotification('パスワードを入力してください', 'error');
        return;
    }

    try {
        const response = await fetch('/api/sudo-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                password: password
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('sudoパスワードを設定しました', 'success');
            closeSudoPasswordModal();
        } else {
            showNotification('設定に失敗しました: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('sudo設定エラー:', error);
        showNotification('設定に失敗しました', 'error');
    }
}

// 通知を表示
function showNotification(message, type = 'info') {
    // シンプルな通知実装
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#667eea'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// アニメーション用のスタイルを追加
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// モーダルの外側クリックで閉じる
document.addEventListener('click', function(e) {
    const portScanModal = document.getElementById('portScanConfigModal');
    const sudoModal = document.getElementById('sudoPasswordModal');

    if (e.target === portScanModal) {
        closePortScanConfig();
    }
    if (e.target === sudoModal) {
        closeSudoPasswordModal();
    }
});
