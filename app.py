#!/usr/bin/env python3
"""
LocalNetScan - ローカルネットワークスキャンFlaskアプリケーション
"""

from flask import Flask, render_template, jsonify, request
from scanner import NetworkScanner
import threading
import time
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'localnetscan-secret-key-change-in-production'

# グローバル変数
scanner = NetworkScanner()
scan_status = {
    'is_scanning': False,
    'last_scan_time': None,
    'scan_progress': 0,
    'current_subnet': ''
}
scan_results = {}
port_scan_results = {}


def background_scan(target_range=None):
    """バックグラウンドでスキャンを実行

    Args:
        target_range: スキャン対象（例: "192.168.0.0/24" または "192.168.0.1-50"）
    """
    global scan_status, scan_results

    scan_status['is_scanning'] = True
    scan_status['scan_progress'] = 0
    scan_status['current_subnet'] = 'スキャン準備中...'

    try:
        print("\n" + "="*60)
        print("ネットワークスキャン開始")
        print("="*60)

        if target_range:
            print(f"\nスキャン対象: {target_range}")
            scan_status['current_subnet'] = target_range
            results = scanner.scan_ip_range(target_range)
        else:
            # サブネットを検出（デフォルト動作）
            print("\n[ステップ 1/2] サブネットを検出中...")
            subnets = scanner.detect_subnets()
            total_subnets = len(subnets)
            print(f"✓ {total_subnets}個のサブネットを検出しました: {', '.join(subnets)}")

            # 各サブネットをスキャン
            print(f"\n[ステップ 2/2] 各サブネットをスキャン中...")
            results = {}
            for idx, subnet in enumerate(subnets):
                scan_status['current_subnet'] = subnet
                scan_status['scan_progress'] = int((idx / total_subnets) * 100)

                print(f"\n進捗: {idx+1}/{total_subnets} サブネット")
                subnet_results = scanner.ping_scan(subnet)
                results.update(subnet_results)

        scan_results = results
        scan_status['last_scan_time'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        scan_status['scan_progress'] = 100

        print("\n" + "="*60)
        print(f"全スキャン完了!")
        print(f"検出されたホスト総数: {len(results)}台")
        print("="*60 + "\n")

    except Exception as e:
        print(f"\n✗ スキャンエラー: {e}\n")
        scan_status['error'] = str(e)

    finally:
        scan_status['is_scanning'] = False
        scan_status['current_subnet'] = ''


@app.route('/')
def index():
    """メインページ"""
    return render_template('index.html')


@app.route('/api/scan', methods=['POST'])
def start_scan():
    """
    ネットワークスキャンを開始

    Request Body:
        target_range (optional): スキャン対象（例: "192.168.0.0/24" または "192.168.0.1-50"）

    Returns:
        JSON: スキャン開始ステータス
    """
    global scan_status

    # nmapの利用可否をチェック
    if not scanner.check_nmap_available():
        return jsonify({
            'status': 'error',
            'message': 'nmapがインストールされていません。インストール後に再度お試しください。',
            'nmap_error': scanner.nmap_error
        }), 503

    if scan_status['is_scanning']:
        return jsonify({
            'status': 'error',
            'message': 'スキャンは既に実行中です'
        }), 400

    # リクエストボディからIP範囲を取得
    target_range = None
    if request.json and 'target_range' in request.json:
        target_range = request.json['target_range']

    # バックグラウンドでスキャンを開始
    scan_thread = threading.Thread(target=background_scan, args=(target_range,))
    scan_thread.daemon = True
    scan_thread.start()

    return jsonify({
        'status': 'success',
        'message': 'スキャンを開始しました',
        'target_range': target_range
    })


@app.route('/api/scan-status', methods=['GET'])
def get_scan_status():
    """
    スキャンの状態を取得

    Returns:
        JSON: スキャンステータス
    """
    status = scan_status.copy()
    status['nmap_available'] = scanner.check_nmap_available()
    if not scanner.check_nmap_available():
        status['nmap_error'] = scanner.nmap_error
    return jsonify(status)


@app.route('/api/results', methods=['GET'])
def get_results():
    """
    スキャン結果を取得

    Returns:
        JSON: スキャン結果
    """
    return jsonify({
        'hosts': scan_results,
        'total': len(scan_results)
    })


@app.route('/api/port-scan/<host>', methods=['POST'])
def start_port_scan(host):
    """
    指定されたホストに対してポートスキャンを実行（2段階スキャン）

    Args:
        host: スキャン対象のIPアドレス

    Returns:
        JSON: ポートスキャン結果
    """
    global port_scan_results

    # ホストが存在するか確認
    if host not in scan_results:
        return jsonify({
            'status': 'error',
            'message': '指定されたホストが見つかりません'
        }), 404

    # スキャンオプションを取得（デフォルト: -sT -sV）
    scan_args = request.json.get('arguments', '-sT -sV') if request.json else '-sT -sV'

    def scan_in_background():
        """バックグラウンドで2段階スキャンを実行"""
        try:
            # ステージ1: 優先ポートスキャン
            print(f"\n[ステージ 1/2] {host} の優先ポートをスキャン中...")
            priority_result = scanner.port_scan(host, scan_args, priority_only=True)
            port_scan_results[host] = priority_result

            # ステージ2: 全ポートスキャン
            print(f"\n[ステージ 2/2] {host} の全ポートをスキャン中...")
            full_result = scanner.port_scan(host, scan_args, priority_only=False)
            port_scan_results[host] = full_result

        except Exception as e:
            print(f"\nポートスキャンエラー ({host}): {e}\n")
            if host in port_scan_results:
                port_scan_results[host]['error'] = str(e)

    # バックグラウンドでスキャンを開始
    scan_thread = threading.Thread(target=scan_in_background)
    scan_thread.daemon = True
    scan_thread.start()

    return jsonify({
        'status': 'success',
        'message': '2段階ポートスキャンを開始しました（優先ポート→全ポート）'
    })


@app.route('/api/port-scan/<host>', methods=['GET'])
def get_port_scan_result(host):
    """
    指定されたホストのポートスキャン結果を取得

    Args:
        host: IPアドレス

    Returns:
        JSON: ポートスキャン結果
    """
    if host in port_scan_results:
        return jsonify({
            'status': 'success',
            'data': port_scan_results[host]
        })
    else:
        # スキャン結果がない場合、404ではなくスキャン待機中として返す
        return jsonify({
            'status': 'pending',
            'message': 'スキャン実行中または未実行です'
        })


@app.route('/api/host/<host>', methods=['DELETE'])
def remove_host(host):
    """
    スキャン結果から指定されたホストを削除

    Args:
        host: IPアドレス

    Returns:
        JSON: 削除結果
    """
    global scan_results, port_scan_results

    if host in scan_results:
        del scan_results[host]
        if host in port_scan_results:
            del port_scan_results[host]

        return jsonify({
            'status': 'success',
            'message': f'ホスト {host} を削除しました'
        })
    else:
        return jsonify({
            'status': 'error',
            'message': 'ホストが見つかりません'
        }), 404


@app.route('/api/sudo-password', methods=['POST'])
def set_sudo_password():
    """
    sudoパスワードを設定

    Request Body:
        {
            "password": "sudo password"
        }

    Returns:
        JSON: 設定結果
    """
    if not request.json or 'password' not in request.json:
        return jsonify({
            'status': 'error',
            'message': 'パスワードが指定されていません'
        }), 400

    password = request.json['password']

    try:
        # パスワードをスキャナーに設定
        scanner.set_sudo_password(password)

        return jsonify({
            'status': 'success',
            'message': 'sudoパスワードを設定しました'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'設定に失敗しました: {str(e)}'
        }), 500


@app.route('/api/process-info/<host>', methods=['GET'])
def get_process_info(host):
    """
    指定されたホストのポートで動作しているプロセス情報を取得
    注: リモートホストのプロセス情報は取得できません（ローカルマシンのみ）

    Args:
        host: IPアドレス（ローカルマシンかどうかのチェックに使用）

    Returns:
        JSON: プロセス情報 {port/protocol: {pid: xxx, name: xxx}}
    """
    import subprocess
    import re

    process_info = {}

    # ローカルIPアドレスのリスト
    local_ips = ['127.0.0.1', 'localhost', '::1']
    try:
        # 実際のローカルIPも追加
        local_ips.append(scanner.get_local_ip())
    except:
        pass

    # リモートホストの場合は空の結果を返す（エラーではない）
    if host not in local_ips and not host.startswith('127.') and not host.startswith('::'):
        # リモートホストのプロセス情報は取得できないため、空の結果を返す
        return jsonify({
            'status': 'success',
            'data': {},
            'note': 'リモートホストのプロセス情報は取得できません'
        })

    try:
        # lsof または netstat を使用してポート情報を取得
        # Linuxの場合は ss または netstat を使用
        result = None
        try:
            result = subprocess.run(
                ['ss', '-tunlp'],
                capture_output=True,
                text=True,
                timeout=10
            )
        except FileNotFoundError:
            # ssが見つからない場合はnetstatを試す
            pass

        if result is None or result.returncode != 0:
            # ssが使えない場合はnetstatを試す
            try:
                result = subprocess.run(
                    ['netstat', '-tunlp'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
            except FileNotFoundError:
                # netstatも見つからない場合は空の結果を返す
                return jsonify({
                    'status': 'success',
                    'data': {},
                    'warning': 'ssまたはnetstatコマンドが見つかりません'
                })

        output = result.stdout

        # 各行をパース
        for line in output.split('\n'):
            # ポート番号を抽出
            # 例: tcp   LISTEN 0      128    0.0.0.0:22    0.0.0.0:*    users:(("sshd",pid=1234,fd=3))
            # より柔軟なパターンマッチング

            # パターン1: users:(("name",pid=123,fd=3))
            match = re.search(r':(\d+)\s.*users:\(\("([^"]+)",pid=(\d+)', line)
            if match:
                port = match.group(1)
                name = match.group(2)
                pid = match.group(3)

                # プロトコルを判定
                protocol = 'tcp' if 'tcp' in line.lower() else 'udp'
                port_key = f"{port}/{protocol}"

                process_info[port_key] = {
                    'pid': int(pid),
                    'name': name
                }
                continue

            # パターン2: lsof形式 (補完)
            # 例: python3   12345  user   3u  IPv4  12345      0t0  TCP *:5000 (LISTEN)
            match2 = re.search(r'^(\S+)\s+(\d+).*?[:\*](\d+)\s+\(LISTEN\)', line)
            if match2:
                name = match2.group(1)
                pid = match2.group(2)
                port = match2.group(3)

                port_key = f"{port}/tcp"
                if port_key not in process_info:
                    process_info[port_key] = {
                        'pid': int(pid),
                        'name': name
                    }

        return jsonify({
            'status': 'success',
            'data': process_info
        })

    except subprocess.TimeoutExpired:
        # タイムアウトの場合も空の結果を返す（エラーにしない）
        return jsonify({
            'status': 'success',
            'data': {},
            'warning': 'プロセス情報の取得がタイムアウトしました'
        })
    except Exception as e:
        # エラーの場合も空の結果を返す（500エラーにしない）
        print(f"プロセス情報取得エラー: {e}")
        return jsonify({
            'status': 'success',
            'data': {},
            'warning': f'プロセス情報を取得できませんでした'
        })


@app.route('/api/kill-process/<int:pid>', methods=['POST'])
def kill_process(pid):
    """
    指定されたプロセスを安全に終了

    Args:
        pid: プロセスID

    Returns:
        JSON: 終了結果
    """
    import subprocess
    import signal
    import os

    # 安全性チェック: 重要なシステムプロセスを保護
    protected_pids = [0, 1]  # init/systemd など
    if pid in protected_pids or pid <= 0:
        return jsonify({
            'status': 'error',
            'message': f'PID {pid} は保護されたプロセスです'
        }), 403

    try:
        # PIDが存在するか確認
        try:
            os.kill(pid, 0)  # シグナル0で存在確認
        except OSError:
            return jsonify({
                'status': 'error',
                'message': f'PID {pid} のプロセスが見つかりません'
            }), 404

        # プロセス名を取得して確認用に表示
        try:
            proc_name_result = subprocess.run(
                ['ps', '-p', str(pid), '-o', 'comm='],
                capture_output=True,
                text=True,
                timeout=2
            )
            proc_name = proc_name_result.stdout.strip() if proc_name_result.returncode == 0 else 'unknown'
        except:
            proc_name = 'unknown'

        # プロセスを終了
        try:
            os.kill(pid, signal.SIGTERM)  # まずSIGTERMで穏やかに終了
            return jsonify({
                'status': 'success',
                'message': f'プロセス {pid} ({proc_name}) を終了しました'
            })
        except PermissionError:
            # 権限がない場合はsudoで試す
            if scanner.sudo_password:
                try:
                    result = subprocess.run(
                        ['sudo', '-S', 'kill', '-TERM', str(pid)],
                        input=f"{scanner.sudo_password}\n",
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    if result.returncode == 0:
                        return jsonify({
                            'status': 'success',
                            'message': f'プロセス {pid} ({proc_name}) を終了しました（sudo使用）'
                        })
                    else:
                        # パスワードエラーのチェック
                        if 'incorrect password' in result.stderr.lower() or 'sorry' in result.stderr.lower():
                            return jsonify({
                                'status': 'error',
                                'message': 'sudoパスワードが正しくありません'
                            }), 403
                        return jsonify({
                            'status': 'error',
                            'message': f'プロセスの終了に失敗しました: {result.stderr}'
                        }), 500
                except subprocess.TimeoutExpired:
                    return jsonify({
                        'status': 'error',
                        'message': 'プロセスの終了がタイムアウトしました'
                    }), 500
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'プロセスの終了に権限が必要です。sudo設定からパスワードを設定してください'
                }), 403

    except Exception as e:
        print(f"プロセス終了エラー (PID {pid}): {e}")
        return jsonify({
            'status': 'error',
            'message': f'プロセスの終了に失敗しました: {str(e)}'
        }), 500


@app.before_request
def limit_remote_addr():
    """
    セキュリティ: ローカルホストからのアクセスのみ許可
    """
    allowed_ips = ['127.0.0.1', 'localhost', '::1']
    client_ip = request.remote_addr

    # 開発環境では全てのアクセスを許可（本番環境では削除すること）
    # if client_ip not in allowed_ips:
    #     return jsonify({'error': 'アクセス拒否: ローカルホストのみアクセス可能です'}), 403


if __name__ == '__main__':
    import socket

    print("\n" + "="*60)
    print("LocalNetScan - ローカルネットワークスキャナー")
    print("="*60)
    print("✓ アプリケーションを起動しています...")

    # nmapのチェック
    if not scanner.check_nmap_available():
        print("\n" + "!"*60)
        print("⚠ 警告: nmapが利用できません")
        print("!"*60)
        print("nmapをインストール後、Webインターフェースから")
        print("手動でスキャンを実行してください")
        print("!"*60)

    # ポートを試す（5000, 5001, 5002）
    host = '127.0.0.1'
    ports_to_try = [5000, 5001, 5002]
    port_found = None

    for port in ports_to_try:
        # ポートが使用可能かチェック
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((host, port))
        sock.close()

        if result != 0:  # ポートが空いている
            port_found = port
            print(f"✓ ポート {port} が利用可能です")
            print(f"✓ ブラウザで http://{host}:{port} にアクセスしてください")
            print("="*60)
            break
        else:
            print(f"⚠ ポート {port} は既に使用中です...")

    if port_found is None:
        print("\n" + "!"*60)
        print("✗ エラー: 利用可能なポートが見つかりませんでした")
        print("!"*60)
        print("ポート 5000, 5001, 5002 が全て使用中です。")
        print("いずれかのポートを解放してから再度お試しください。")
        print("\nヒント:")
        print("- macOSの場合: 'AirPlay Receiver'を無効化")
        print("  (システム設定 → 一般 → AirDropとHandoff)")
        print("- 使用中のプロセスを確認:")
        print("  lsof -i :5000")
        print("!"*60 + "\n")
        exit(1)

    # Flaskアプリケーションを起動
    # host='0.0.0.0' でローカルネットワークからアクセス可能
    # 本番環境ではセキュリティに注意
    app.run(host=host, port=port_found, debug=True, use_reloader=False)
