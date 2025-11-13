#!/usr/bin/env python3
"""
ネットワークスキャン機能を提供するモジュール
"""

import nmap
import socket
import subprocess
import re
import platform
from typing import List, Dict, Optional


class NetworkScanner:
    """ネットワークスキャンを実行するクラス"""

    def __init__(self):
        """スキャナーの初期化"""
        self.scan_results = {}
        self.nmap_available = False
        self.nmap_error = None

        try:
            self.nm = nmap.PortScanner()
            self.nmap_available = True
        except Exception as e:
            self.nmap_error = str(e)
            print("=" * 80)
            print("エラー: nmapがシステムにインストールされていません")
            print("=" * 80)
            print("\nmacOSの場合、以下のコマンドでインストールしてください:")
            print("  brew install nmap")
            print("\nUbuntu/Debianの場合:")
            print("  sudo apt-get update")
            print("  sudo apt-get install nmap")
            print("\nWindowsの場合:")
            print("  https://nmap.org/download.html からダウンロードしてインストール")
            print("=" * 80)
            self.nm = None

    def check_nmap_available(self) -> bool:
        """
        nmapが利用可能かチェック

        Returns:
            bool: nmapが利用可能な場合True
        """
        return self.nmap_available

    def get_local_ip(self) -> str:
        """
        ローカルIPアドレスを取得

        Returns:
            str: ローカルIPアドレス
        """
        try:
            # ダミーのUDP接続を作成してローカルIPを取得
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            return local_ip
        except Exception as e:
            print(f"ローカルIP取得エラー: {e}")
            return "127.0.0.1"

    def detect_subnets(self) -> List[str]:
        """
        192.168.x.x のサブネットを検出

        Returns:
            List[str]: 検出されたサブネットのリスト（例: ["192.168.0.0/24", "192.168.1.0/24"]）
        """
        subnets = []
        local_ip = self.get_local_ip()

        # ローカルIPから所属サブネットを判定
        ip_parts = local_ip.split('.')
        if ip_parts[0] == '192' and ip_parts[1] == '168':
            # 現在のサブネットを追加
            subnet = f"192.168.{ip_parts[2]}.0/24"
            subnets.append(subnet)

        # 追加で他の一般的な192.168.x.0サブネットもスキャン対象にする場合
        # （複数のネットワークインターフェースがある環境を想定）
        try:
            if platform.system() == 'Linux':
                result = subprocess.run(['ip', 'addr'], capture_output=True, text=True, timeout=5)
                output = result.stdout
                # 192.168.x.x のアドレスを抽出
                pattern = r'inet (192\.168\.\d+\.\d+)/\d+'
                matches = re.findall(pattern, output)
                for match in matches:
                    ip_parts = match.split('.')
                    subnet = f"192.168.{ip_parts[2]}.0/24"
                    if subnet not in subnets:
                        subnets.append(subnet)
            elif platform.system() == 'Darwin':  # macOS
                result = subprocess.run(['ifconfig'], capture_output=True, text=True, timeout=5)
                output = result.stdout
                pattern = r'inet (192\.168\.\d+\.\d+)'
                matches = re.findall(pattern, output)
                for match in matches:
                    ip_parts = match.split('.')
                    subnet = f"192.168.{ip_parts[2]}.0/24"
                    if subnet not in subnets:
                        subnets.append(subnet)
        except Exception as e:
            print(f"サブネット検出エラー: {e}")

        return subnets if subnets else ["192.168.0.0/24"]

    def ping_scan(self, subnet: str) -> Dict[str, Dict]:
        """
        指定されたサブネットに対してPingスキャン（nmap -sn）を実行

        Args:
            subnet: スキャン対象のサブネット（例: "192.168.0.0/24"）

        Returns:
            Dict: スキャン結果（キー: IPアドレス、値: ホスト情報）
        """
        results = {}

        if not self.nmap_available:
            print(f"エラー: nmapが利用できません - {self.nmap_error}")
            return results

        try:
            import time
            start_time = time.time()

            print(f"\n{'='*60}")
            print(f"Pingスキャン開始: {subnet}")
            print(f"{'='*60}")
            print("スキャン中... (最大254台のホストをチェック)")
            print("見つかったホスト:")

            # スキャンを実行
            self.nm.scan(hosts=subnet, arguments='-sn')

            # 結果を処理
            for host in self.nm.all_hosts():
                if self.nm[host].state() == 'up':
                    hostname = self.nm[host].hostname() if self.nm[host].hostname() else 'Unknown'
                    vendor = ''
                    if 'mac' in self.nm[host]['addresses']:
                        mac = self.nm[host]['addresses']['mac']
                        vendor = self.nm[host]['vendor'].get(mac, '') if 'vendor' in self.nm[host] else ''

                    results[host] = {
                        'hostname': hostname,
                        'state': 'up',
                        'vendor': vendor,
                        'subnet': subnet
                    }

                    # 見つかったホストをリアルタイムで表示
                    print(f"  ✓ {host:15s} - {hostname}")

            elapsed_time = time.time() - start_time
            print(f"\n{'='*60}")
            print(f"スキャン完了: {len(results)}台のホストを検出")
            print(f"所要時間: {elapsed_time:.1f}秒")
            print(f"{'='*60}\n")

        except Exception as e:
            print(f"\nPingスキャンエラー: {e}\n")

        return results

    def scan_all_subnets(self) -> Dict[str, Dict]:
        """
        すべての検出されたサブネットをスキャン

        Returns:
            Dict: 全スキャン結果
        """
        all_results = {}
        subnets = self.detect_subnets()

        for subnet in subnets:
            results = self.ping_scan(subnet)
            all_results.update(results)

        self.scan_results = all_results
        return all_results

    def port_scan(self, host: str, arguments: str = '-sS -sV') -> Dict:
        """
        指定されたホストに対して詳細ポートスキャンを実行

        Args:
            host: スキャン対象のIPアドレス
            arguments: nmapの引数（デフォルト: '-sS -sV'）

        Returns:
            Dict: ポートスキャン結果
        """
        result = {
            'host': host,
            'ports': [],
            'os': '',
            'scan_time': ''
        }

        if not self.nmap_available:
            result['error'] = f"nmapが利用できません: {self.nmap_error}"
            print(f"エラー: {result['error']}")
            return result

        try:
            import time
            start_time = time.time()

            print(f"\n{'='*60}")
            print(f"ポートスキャン開始: {host}")
            print(f"スキャンタイプ: {arguments}")
            print(f"{'='*60}")
            print("スキャン中... (ポートとサービスを検出しています)")

            # -sS はroot権限が必要なため、権限がない場合は -sT を使用
            try:
                self.nm.scan(hosts=host, arguments=arguments)
            except Exception as e:
                # SYNスキャンが失敗した場合はTCPコネクトスキャンにフォールバック
                if '-sS' in arguments:
                    print(f"⚠ SYNスキャン失敗、TCPコネクトスキャンに切り替え")
                    arguments = arguments.replace('-sS', '-sT')
                    self.nm.scan(hosts=host, arguments=arguments)
                else:
                    raise

            if host in self.nm.all_hosts():
                print("\n検出されたポート:")
                # ポート情報を取得
                for proto in self.nm[host].all_protocols():
                    ports = self.nm[host][proto].keys()
                    for port in ports:
                        port_info = self.nm[host][proto][port]
                        result['ports'].append({
                            'port': port,
                            'protocol': proto,
                            'state': port_info['state'],
                            'service': port_info.get('name', ''),
                            'version': port_info.get('version', ''),
                            'product': port_info.get('product', '')
                        })

                        # 見つかったポートを表示
                        service = port_info.get('name', 'unknown')
                        version = port_info.get('version', '')
                        product = port_info.get('product', '')
                        version_str = f"{product} {version}".strip() if product or version else ""
                        print(f"  ✓ {port}/{proto:3s} - {service:15s} {version_str}")

                # OS情報（あれば）
                if 'osmatch' in self.nm[host]:
                    if len(self.nm[host]['osmatch']) > 0:
                        result['os'] = self.nm[host]['osmatch'][0]['name']
                        print(f"\nOS検出: {result['os']}")

            elapsed_time = time.time() - start_time
            print(f"\n{'='*60}")
            print(f"ポートスキャン完了: {len(result['ports'])}個のポートを検出")
            print(f"所要時間: {elapsed_time:.1f}秒")
            print(f"{'='*60}\n")

        except Exception as e:
            print(f"\nポートスキャンエラー ({host}): {e}\n")
            result['error'] = str(e)

        return result

    def get_scan_results(self) -> Dict[str, Dict]:
        """
        最後のスキャン結果を取得

        Returns:
            Dict: スキャン結果
        """
        return self.scan_results
