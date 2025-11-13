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


def background_scan():
    """バックグラウンドでスキャンを実行"""
    global scan_status, scan_results

    scan_status['is_scanning'] = True
    scan_status['scan_progress'] = 0
    scan_status['current_subnet'] = '検出中...'

    try:
        print("\n" + "="*60)
        print("ネットワークスキャン開始")
        print("="*60)

        # サブネットを検出
        print("\n[ステップ 1/2] サブネットを検出中...")
        subnets = scanner.detect_subnets()
        total_subnets = len(subnets)
        print(f"✓ {total_subnets}個のサブネットを検出しました: {', '.join(subnets)}")

        # 各サブネットをスキャン
        print(f"\n[ステップ 2/2] 各サブネットをスキャン中...")
        all_results = {}
        for idx, subnet in enumerate(subnets):
            scan_status['current_subnet'] = subnet
            scan_status['scan_progress'] = int((idx / total_subnets) * 100)

            print(f"\n進捗: {idx+1}/{total_subnets} サブネット")
            results = scanner.ping_scan(subnet)
            all_results.update(results)

        scan_results = all_results
        scan_status['last_scan_time'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        scan_status['scan_progress'] = 100

        print("\n" + "="*60)
        print(f"全スキャン完了!")
        print(f"検出されたホスト総数: {len(all_results)}台")
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

    # バックグラウンドでスキャンを開始
    scan_thread = threading.Thread(target=background_scan)
    scan_thread.daemon = True
    scan_thread.start()

    return jsonify({
        'status': 'success',
        'message': 'スキャンを開始しました'
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
    指定されたホストに対してポートスキャンを実行

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

    try:
        # ポートスキャンを実行
        result = scanner.port_scan(host, scan_args)
        port_scan_results[host] = result

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'ポートスキャンエラー: {str(e)}'
        }), 500


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
        return jsonify({
            'status': 'error',
            'message': 'ポートスキャン結果が見つかりません'
        }), 404


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


def startup_scan():
    """起動時に自動スキャンを実行"""
    time.sleep(2)  # アプリケーション起動を待つ

    if not scanner.check_nmap_available():
        print("\n" + "!"*60)
        print("⚠ 警告: nmapが利用できません")
        print("!"*60)
        print("nmapをインストール後、Webインターフェースから")
        print("手動でスキャンを実行してください")
        print("!"*60 + "\n")
        return

    print("\n" + "="*60)
    print("起動時スキャンを開始します...")
    print("="*60)
    background_scan()


if __name__ == '__main__':
    print("\n" + "="*60)
    print("LocalNetScan - ローカルネットワークスキャナー")
    print("="*60)
    print("✓ アプリケーションを起動しています...")
    print("✓ ブラウザで http://127.0.0.1:5000 にアクセスしてください")
    print("="*60)

    # 起動時スキャンを別スレッドで実行
    startup_thread = threading.Thread(target=startup_scan)
    startup_thread.daemon = True
    startup_thread.start()

    # Flaskアプリケーションを起動
    # host='0.0.0.0' でローカルネットワークからアクセス可能
    # 本番環境ではセキュリティに注意
    app.run(host='127.0.0.1', port=5000, debug=True, use_reloader=False)
