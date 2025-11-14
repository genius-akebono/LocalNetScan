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
        self.sudo_password = None

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

    def set_sudo_password(self, password: str):
        """
        sudoパスワードを設定

        Args:
            password: sudoパスワード
        """
        self.sudo_password = password
        print("sudoパスワードが設定されました")

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

    def scan_ip_range(self, target_range: str) -> Dict[str, Dict]:
        """
        指定されたIP範囲をスキャン

        Args:
            target_range: スキャン対象
                - サブネット形式: "192.168.0.0/24"
                - IP範囲形式: "192.168.0.1-50"

        Returns:
            Dict: スキャン結果
        """
        if not self.nmap_available:
            print(f"エラー: nmapが利用できません - {self.nmap_error}")
            return {}

        # IP範囲形式を変換（192.168.0.1-50 → 192.168.0.1-192.168.0.50）
        if '-' in target_range and '/' not in target_range:
            parts = target_range.split('-')
            if len(parts) == 2:
                base_ip = parts[0]
                end_num = parts[1]
                # IPアドレスのベース部分を取得（例: 192.168.0）
                ip_parts = base_ip.split('.')
                if len(ip_parts) == 4:
                    base = '.'.join(ip_parts[:3])
                    start_num = ip_parts[3]
                    # nmap形式に変換
                    target_range = f"{base}.{start_num}-{end_num}"

        return self.ping_scan(target_range)

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

    def _run_nmap_with_sudo(self, host: str, arguments: str) -> Dict:
        """
        sudoを使用してnmapコマンドを実行

        Args:
            host: スキャン対象のIPアドレス
            arguments: nmapの引数

        Returns:
            Dict: スキャン結果（XMLパース後）
        """
        import subprocess
        import tempfile
        import xml.etree.ElementTree as ET

        # 一時ファイルにXML出力を保存
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as tmp:
            output_file = tmp.name

        try:
            # sudoでnmapを実行（パスワードを標準入力から渡す）
            cmd = ['sudo', '-S', 'nmap', '-oX', output_file] + arguments.split() + [host]

            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            # sudoパスワードを渡す
            stdout, stderr = process.communicate(input=f"{self.sudo_password}\n", timeout=300)

            if process.returncode != 0:
                if 'incorrect password' in stderr.lower() or 'sorry' in stderr.lower():
                    raise Exception("sudoパスワードが正しくありません")
                print(f"nmap標準出力: {stdout}")
                print(f"nmapエラー出力: {stderr}")

            # XML結果を読み込んでパース
            tree = ET.parse(output_file)
            root = tree.getroot()

            # 結果を辞書形式に変換
            scan_result = {
                'host': host,
                'ports': [],
                'os': ''
            }

            # ホスト情報を取得
            for host_elem in root.findall('host'):
                # ポート情報を取得
                for port_elem in host_elem.findall('.//port'):
                    port_id = port_elem.get('portid')
                    protocol = port_elem.get('protocol')
                    state_elem = port_elem.find('state')
                    service_elem = port_elem.find('service')

                    if state_elem is not None:
                        state = state_elem.get('state')
                        service_name = service_elem.get('name', '') if service_elem is not None else ''
                        product = service_elem.get('product', '') if service_elem is not None else ''
                        version = service_elem.get('version', '') if service_elem is not None else ''

                        scan_result['ports'].append({
                            'port': int(port_id),
                            'protocol': protocol,
                            'state': state,
                            'service': service_name,
                            'product': product,
                            'version': version
                        })

                # OS情報を取得
                osmatch = host_elem.find('.//osmatch')
                if osmatch is not None:
                    scan_result['os'] = osmatch.get('name', '')

            return scan_result

        finally:
            # 一時ファイルを削除
            import os
            if os.path.exists(output_file):
                os.remove(output_file)

    def port_scan(self, host: str, arguments: str = '-sS -sV', priority_only: bool = False, is_range_scan: bool = False) -> Dict:
        """
        指定されたホストに対して詳細ポートスキャンを実行

        Args:
            host: スキャン対象のIPアドレス
            arguments: nmapの引数（デフォルト: '-sS -sV'）
            priority_only: Trueの場合、優先ポートのみスキャン

        Returns:
            Dict: ポートスキャン結果
        """
        result = {
            'host': host,
            'ports': [],
            'os': '',
            'scan_time': '',
            'scan_stage': 'priority' if priority_only else 'full'
        }

        if not self.nmap_available:
            result['error'] = f"nmapが利用できません: {self.nmap_error}"
            print(f"エラー: {result['error']}")
            return result

        # 優先ポートの定義
        priority_ports = [80, 8080, 5000, 5001, 5050, 3000, 3001]

        try:
            import time
            start_time = time.time()

            print(f"\n{'='*60}")
            print(f"ポートスキャン開始: {host}")
            if priority_only:
                print(f"スキャンタイプ: 優先ポート ({','.join(map(str, priority_ports))})")
                # 優先ポートのみスキャン
                ports_str = ','.join(map(str, priority_ports))
                scan_args = f"-p {ports_str} {arguments}"
            elif is_range_scan:
                # 範囲スキャンの場合は引数にすでに-pとタイミングオプションが含まれている
                print(f"スキャンタイプ: {arguments}")
                scan_args = arguments
            else:
                print(f"スキャンタイプ: {arguments}")
                scan_args = arguments
            print(f"{'='*60}")

            # root権限が必要なスキャンかチェック
            needs_root = '-sS' in scan_args or '-sU' in scan_args or '-O' in scan_args

            if needs_root and self.sudo_password:
                print("sudo権限でnmapを実行中...")
                # sudoでnmapを実行
                sudo_result = self._run_nmap_with_sudo(host, scan_args)
                result['ports'] = sudo_result['ports']
                result['os'] = sudo_result['os']

                # 結果を表示
                if result['ports']:
                    print("\n検出されたポート:")
                    for port_info in result['ports']:
                        service = port_info.get('service', 'unknown')
                        version = port_info.get('version', '')
                        product = port_info.get('product', '')
                        version_str = f"{product} {version}".strip() if product or version else ""
                        print(f"  ✓ {port_info['port']}/{port_info['protocol']:3s} - {service:15s} {version_str}")

                if result['os']:
                    print(f"\nOS検出: {result['os']}")

            else:
                print("スキャン中... (ポートとサービスを検出しています)")
                # -sS はroot権限が必要なため、権限がない場合は -sT を使用
                try:
                    self.nm.scan(hosts=host, arguments=scan_args)
                except Exception as e:
                    # SYNスキャンが失敗した場合はTCPコネクトスキャンにフォールバック
                    if '-sS' in scan_args and not self.sudo_password:
                        print(f"⚠ SYNスキャンにはroot権限が必要です。TCPコネクトスキャンに切り替えます")
                        print(f"  ヒント: sudo設定からパスワードを設定すると-sSスキャンが使用できます")
                        scan_args = scan_args.replace('-sS', '-sT')
                        self.nm.scan(hosts=host, arguments=scan_args)
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
            scan_type_str = "優先" if priority_only else "全"
            print(f"{scan_type_str}ポートスキャン完了: {len(result['ports'])}個のポートを検出")
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
