import tkinter as tk
from tkinter import ttk, messagebox
import json
import os
import ast

VALID_TOKENS = {
    "MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4",
    "グループ1", "グループ2", "頭割り", "扇", "円", "なし",
    "and", "or", "not", "(", ")"
}

REPLACE_MAP = {
    "グループ1": "g1", "グループ2": "g2",
    "頭割り": "m_share", "扇": "m_fan", "円": "m_circle", "なし": "m_none"
}

def validate_condition(condition_str):
    if not condition_str or not condition_str.strip():
        return True, ""
    
    # 括弧の周りにスペースを挿入してトークン分割しやすくする
    s = condition_str.replace("(", " ( ").replace(")", " ) ")
    tokens = s.split()
    
    # 無効なトークンのチェック
    for token in tokens:
        if token not in VALID_TOKENS:
            if token.lower() in {"and", "or", "not"}:
                continue
            return False, f"無効な単語が含まれています: '{token}'"
            
    # 構文チェック用にPython互換の式に変換
    expr_parts = []
    for token in tokens:
        t_low = token.lower()
        if t_low in {"and", "or", "not"}:
            expr_parts.append(t_low)
        elif token in REPLACE_MAP:
            expr_parts.append(REPLACE_MAP[token])
        elif token in {"(", ")"}:
            expr_parts.append(token)
        else:
            expr_parts.append(token)
            
    expr_str = " ".join(expr_parts)
    
    try:
        ast.parse(expr_str, mode='eval')
    except SyntaxError as e:
        return False, f"構文エラーです: {e.msg}"
        
    return True, ""


class AdjusterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("開発者用回答調整ツール")
        self.root.geometry("1400x750")
        
        self.config_path = "config.json"
        self.config_data = {}
        
        # 選択状態の管理
        self.current_phase = "1"
        self.selected_button_index = -1  # 選択中のボタンのインデックス
        self.drag_target = None  # ドラッグ中のターゲット
        self.drag_start_x = 0
        self.drag_start_y = 0
        
        # UI構築
        self.create_widgets()
        
        # データの読み込み
        self.load_config()
        self.draw_canvas()

    def create_widgets(self):
        # 左右分割レイアウト
        self.paned = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True)
        
        # 左側：キャンバス領域
        self.left_frame = ttk.Frame(self.paned, padding=10)
        self.paned.add(self.left_frame, weight=3)
        
        self.canvas_label = ttk.Label(self.left_frame, text="プレビューキャンバス (1024x576) - ドラッグで移動、選択ボタンは右下ハンドルでリサイズ", font=("MS Gothic", 10, "bold"))
        self.canvas_label.pack(anchor=tk.W, pady=5)
        
        # 1024x576のキャンバス
        self.canvas = tk.Canvas(self.left_frame, width=1024, height=576, bg="#1a1a1a", highlightthickness=1, highlightbackground="#333333")
        self.canvas.pack(fill=tk.BOTH, expand=True)
        
        # キャンバスイベントのバインド
        self.canvas.bind("<ButtonPress-1>", self.on_canvas_press)
        self.canvas.bind("<B1-Motion>", self.on_canvas_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_canvas_release)
        
        # 右側：コントロールパネル領域
        self.right_frame = ttk.Frame(self.paned, padding=10)
        self.paned.add(self.right_frame, weight=1)
        
        # スクロール可能な右フレーム
        canvas_right = tk.Canvas(self.right_frame, borderwidth=0, highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.right_frame, orient="vertical", command=canvas_right.yview)
        self.scroll_content = ttk.Frame(canvas_right)
        
        self.scroll_content.bind(
            "<Configure>",
            lambda e: canvas_right.configure(
                scrollregion=canvas_right.bbox("all")
            )
        )
        canvas_right.create_window((0, 0), window=self.scroll_content, anchor="nw")
        canvas_right.configure(yscrollcommand=scrollbar.set)
        
        canvas_right.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # 1. 保存/読込セクション
        file_lf = ttk.LabelFrame(self.scroll_content, text="ファイル操作", padding=10)
        file_lf.pack(fill=tk.X, pady=5)
        
        ttk.Button(file_lf, text="設定を読込", command=self.load_config).pack(side=tk.LEFT, padx=5)
        ttk.Button(file_lf, text="設定を保存", command=self.save_config).pack(side=tk.LEFT, padx=5)
        
        # 2. 全体位置設定（ボス、左右の塔）
        pos_lf = ttk.LabelFrame(self.scroll_content, text="基本要素の座標 (ボス & 塔)", padding=10)
        pos_lf.pack(fill=tk.X, pady=5)
        
        # ボス
        ttk.Label(pos_lf, text="ボス X:").grid(row=0, column=0, sticky=tk.W)
        self.boss_x_var = tk.StringVar()
        self.boss_x_entry = ttk.Entry(pos_lf, textvariable=self.boss_x_var, width=6)
        self.boss_x_entry.grid(row=0, column=1, padx=5, pady=2)
        
        ttk.Label(pos_lf, text="Y:").grid(row=0, column=2, sticky=tk.W)
        self.boss_y_var = tk.StringVar()
        self.boss_y_entry = ttk.Entry(pos_lf, textvariable=self.boss_y_var, width=6)
        self.boss_y_entry.grid(row=0, column=3, padx=5, pady=2)
        
        ttk.Label(pos_lf, text="半径:").grid(row=0, column=4, sticky=tk.W)
        self.boss_r_var = tk.StringVar()
        self.boss_r_entry = ttk.Entry(pos_lf, textvariable=self.boss_r_var, width=6)
        self.boss_r_entry.grid(row=0, column=5, padx=5, pady=2)
        
        # 左塔
        ttk.Label(pos_lf, text="左塔 X:").grid(row=1, column=0, sticky=tk.W)
        self.circle_l_x_var = tk.StringVar()
        self.circle_l_x_entry = ttk.Entry(pos_lf, textvariable=self.circle_l_x_var, width=6)
        self.circle_l_x_entry.grid(row=1, column=1, padx=5, pady=2)
        
        ttk.Label(pos_lf, text="Y:").grid(row=1, column=2, sticky=tk.W)
        self.circle_l_y_var = tk.StringVar()
        self.circle_l_y_entry = ttk.Entry(pos_lf, textvariable=self.circle_l_y_var, width=6)
        self.circle_l_y_entry.grid(row=1, column=3, padx=5, pady=2)
        
        ttk.Label(pos_lf, text="半径:").grid(row=1, column=4, sticky=tk.W)
        self.circle_l_r_var = tk.StringVar()
        self.circle_l_r_entry = ttk.Entry(pos_lf, textvariable=self.circle_l_r_var, width=6)
        self.circle_l_r_entry.grid(row=1, column=5, padx=5, pady=2)
        
        # 右塔
        ttk.Label(pos_lf, text="右塔 X:").grid(row=2, column=0, sticky=tk.W)
        self.circle_r_x_var = tk.StringVar()
        self.circle_r_x_entry = ttk.Entry(pos_lf, textvariable=self.circle_r_x_var, width=6)
        self.circle_r_x_entry.grid(row=2, column=1, padx=5, pady=2)
        
        ttk.Label(pos_lf, text="Y:").grid(row=2, column=2, sticky=tk.W)
        self.circle_r_y_var = tk.StringVar()
        self.circle_r_y_entry = ttk.Entry(pos_lf, textvariable=self.circle_r_y_var, width=6)
        self.circle_r_y_entry.grid(row=2, column=3, padx=5, pady=2)
        
        ttk.Label(pos_lf, text="半径:").grid(row=2, column=4, sticky=tk.W)
        self.circle_r_r_var = tk.StringVar()
        self.circle_r_r_entry = ttk.Entry(pos_lf, textvariable=self.circle_r_r_var, width=6)
        self.circle_r_r_entry.grid(row=2, column=5, padx=5, pady=2)
        
        # 変更適用ボタン
        ttk.Button(pos_lf, text="座標適用", command=self.apply_base_coordinates).grid(row=3, column=0, columnspan=6, pady=5)
        
        # 3. フェーズ選択
        phase_lf = ttk.LabelFrame(self.scroll_content, text="フェーズ管理", padding=10)
        phase_lf.pack(fill=tk.X, pady=5)
        
        ttk.Label(phase_lf, text="編集フェーズ:").pack(side=tk.LEFT)
        self.phase_combobox = ttk.Combobox(phase_lf, values=[str(i) for i in range(1, 13)], width=5, state="readonly")
        self.phase_combobox.set("1")
        self.phase_combobox.pack(side=tk.LEFT, padx=5)
        self.phase_combobox.bind("<<ComboboxSelected>>", self.on_phase_change)
        
        self.phase_type_lbl = ttk.Label(phase_lf, text="(奇数回塔踏みフェーズ)")
        self.phase_type_lbl.pack(side=tk.LEFT, padx=5)
        
        # 4. ボタン追加・編集
        self.btn_lf = ttk.LabelFrame(self.scroll_content, text="回答ボタン設定 (X/Y座標は中央基準)", padding=10)
        self.btn_lf.pack(fill=tk.X, pady=5)
        
        # ボタン一覧リストボックス
        list_frame = ttk.Frame(self.btn_lf)
        list_frame.pack(fill=tk.X, pady=5)
        
        self.btn_listbox = tk.Listbox(list_frame, height=4, exportselection=False)
        self.btn_listbox.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.btn_listbox.bind("<<ListboxSelect>>", self.on_button_select)
        
        list_scroll = ttk.Scrollbar(list_frame, orient="vertical", command=self.btn_listbox.yview)
        list_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.btn_listbox.config(yscrollcommand=list_scroll.set)
        
        # 追加・削除ボタン
        btn_action_frame = ttk.Frame(self.btn_lf)
        btn_action_frame.pack(fill=tk.X, pady=2)
        self.btn_add_widget = ttk.Button(btn_action_frame, text="ボタン追加", command=self.add_button)
        self.btn_add_widget.pack(side=tk.LEFT, padx=2)
        self.btn_del_widget = ttk.Button(btn_action_frame, text="ボタン削除", command=self.delete_button)
        self.btn_del_widget.pack(side=tk.LEFT, padx=2)
        
        # 詳細設定
        self.btn_detail_frame = ttk.LabelFrame(self.btn_lf, text="選択したボタンの詳細", padding=5)
        self.btn_detail_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(self.btn_detail_frame, text="ラベル:").grid(row=0, column=0, sticky=tk.W)
        self.btn_label_var = tk.StringVar()
        self.btn_label_entry = ttk.Entry(self.btn_detail_frame, textvariable=self.btn_label_var)
        self.btn_label_entry.grid(row=0, column=1, columnspan=3, sticky=tk.EW, pady=2)
        
        ttk.Label(self.btn_detail_frame, text="中心 X:").grid(row=1, column=0, sticky=tk.W)
        self.btn_x_var = tk.StringVar()
        self.btn_x_entry = ttk.Entry(self.btn_detail_frame, textvariable=self.btn_x_var, width=6)
        self.btn_x_entry.grid(row=1, column=1, sticky=tk.W, pady=2)
        
        ttk.Label(self.btn_detail_frame, text="中心 Y:").grid(row=1, column=2, sticky=tk.W)
        self.btn_y_var = tk.StringVar()
        self.btn_y_entry = ttk.Entry(self.btn_detail_frame, textvariable=self.btn_y_var, width=6)
        self.btn_y_entry.grid(row=1, column=3, sticky=tk.W, pady=2)
        
        ttk.Label(self.btn_detail_frame, text="幅(W):").grid(row=2, column=0, sticky=tk.W)
        self.btn_w_var = tk.StringVar()
        self.btn_w_entry = ttk.Entry(self.btn_detail_frame, textvariable=self.btn_w_var, width=6)
        self.btn_w_entry.grid(row=2, column=1, sticky=tk.W, pady=2)
        
        ttk.Label(self.btn_detail_frame, text="高(H):").grid(row=2, column=2, sticky=tk.W)
        self.btn_h_var = tk.StringVar()
        self.btn_h_entry = ttk.Entry(self.btn_detail_frame, textvariable=self.btn_h_var, width=6)
        self.btn_h_entry.grid(row=2, column=3, sticky=tk.W, pady=2)
        
        ttk.Label(self.btn_detail_frame, text="正答条件:").grid(row=3, column=0, sticky=tk.W)
        self.btn_cond_var = tk.StringVar()
        self.btn_cond_entry = ttk.Entry(self.btn_detail_frame, textvariable=self.btn_cond_var)
        self.btn_cond_entry.grid(row=3, column=1, columnspan=3, sticky=tk.EW, pady=2)
        
        cond_btn_frame = ttk.Frame(self.btn_detail_frame)
        cond_btn_frame.grid(row=4, column=1, columnspan=3, sticky=tk.EW, pady=2)
        
        ttk.Button(cond_btn_frame, text="条件チェック", command=self.check_condition_syntax).pack(side=tk.LEFT, padx=2)
        ttk.Button(cond_btn_frame, text="値を適用", command=self.apply_button_details).pack(side=tk.LEFT, padx=2)
        
        # ヘルプ情報
        help_txt = "【条件式に使える単語】\n" \
                   "・キャラ: MT, ST, H1, H2, D1, D2, D3, D4\n" \
                   "・グループ: グループ1, グループ2\n" \
                   "・マーカー: 頭割り, 扇, 円, なし\n" \
                   "・演算子: and, or, not, 括弧()\n" \
                   "例: (グループ1 and MT) or (グループ2 and (H1 or ST))"
        help_lbl = ttk.Label(self.btn_lf, text=help_txt, justify=tk.LEFT, font=("MS Gothic", 8), foreground="#666666")
        help_lbl.pack(fill=tk.X, pady=5)
        
        # 5. マーカー変化対象グループの選択（奇数・偶数フェーズ）
        self.change_lf = ttk.LabelFrame(self.scroll_content, text="マーカー変化対象グループ", padding=10)
        self.change_lf.pack(fill=tk.X, pady=5)
        
        self.target_group_var = tk.StringVar(value="")
        
        self.rg1 = ttk.Radiobutton(self.change_lf, text="グループ1", variable=self.target_group_var, value="グループ1", command=self.on_target_group_change)
        self.rg1.pack(anchor=tk.W, pady=2)
        
        self.rg2 = ttk.Radiobutton(self.change_lf, text="グループ2", variable=self.target_group_var, value="グループ2", command=self.on_target_group_change)
        self.rg2.pack(anchor=tk.W, pady=2)
        
        self.rg_none = ttk.Radiobutton(self.change_lf, text="設定なし (消滅 / 自動など)", variable=self.target_group_var, value="", command=self.on_target_group_change)
        self.rg_none.pack(anchor=tk.W, pady=2)

    # configのロード・セーブ
    def load_config(self):
        if not os.path.exists(self.config_path):
            self.config_data = {
                "boss": { "x": 512, "y": 180, "radius": 50 },
                "circle_left": { "x": 350, "y": 380, "radius": 70 },
                "circle_right": { "x": 674, "y": 380, "radius": 70 },
                "phases": {str(i): {"buttons": [], "change_target_group": ""} for i in range(1, 13)}
            }
            self.save_config(silent=True)
        else:
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    self.config_data = json.load(f)
            except Exception as e:
                messagebox.showerror("エラー", f"config.jsonの読み込みに失敗しました:\n{e}")
                return
                
        self.sync_base_inputs()
        self.on_phase_change(None)

    def save_config(self, silent=False):
        # バリデーションチェック
        for ph_id, ph in self.config_data.get("phases", {}).items():
            ph_num = int(ph_id)
            group = ph.get("change_target_group", "")
            if ph_num in [1, 2, 4, 5, 7, 8, 10, 11]:
                if group not in ["グループ1", "グループ2"]:
                    messagebox.showwarning("警告", f"フェーズ {ph_id} のマーカー変化対象グループが正しく設定されていません。\n保存する前に「グループ1」または「グループ2」を選択してください。")
                    return

        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(self.config_data, f, indent=2, ensure_ascii=False)
            if not silent:
                messagebox.showinfo("成功", "設定をconfig.jsonに保存しました。")
        except Exception as e:
            messagebox.showerror("エラー", f"保存に失敗しました:\n{e}")

    # 入力フォーム同期
    def sync_base_inputs(self):
        boss = self.config_data.get("boss", {"x": 512, "y": 180, "radius": 50})
        self.boss_x_var.set(str(boss.get("x")))
        self.boss_y_var.set(str(boss.get("y")))
        self.boss_r_var.set(str(boss.get("radius")))
        
        cl = self.config_data.get("circle_left", {"x": 350, "y": 380, "radius": 70})
        self.circle_l_x_var.set(str(cl.get("x")))
        self.circle_l_y_var.set(str(cl.get("y")))
        self.circle_l_r_var.set(str(cl.get("radius")))
        
        cr = self.config_data.get("circle_right", {"x": 674, "y": 380, "radius": 70})
        self.circle_r_x_var.set(str(cr.get("x")))
        self.circle_r_y_var.set(str(cr.get("y")))
        self.circle_r_r_var.set(str(cr.get("radius")))

    def apply_base_coordinates(self):
        try:
            self.config_data["boss"] = {
                "x": int(self.boss_x_var.get()),
                "y": int(self.boss_y_var.get()),
                "radius": int(self.boss_r_var.get())
            }
            self.config_data["circle_left"] = {
                "x": int(self.circle_l_x_var.get()),
                "y": int(self.circle_l_y_var.get()),
                "radius": int(self.circle_l_r_var.get())
            }
            self.config_data["circle_right"] = {
                "x": int(self.circle_r_x_var.get()),
                "y": int(self.circle_r_y_var.get()),
                "radius": int(self.circle_r_r_var.get())
            }
            self.draw_canvas()
        except ValueError:
            messagebox.showerror("エラー", "座標や半径には整数を入力してください。")

    # フェーズ切り替え
    def on_phase_change(self, event):
        self.current_phase = self.phase_combobox.get()
        ph_num = int(self.current_phase)
        
        phase_names = {
            1: "1回目塔踏み",
            2: "2回目塔踏み",
            3: "過去/未来誘導",
            4: "3回目塔踏み",
            5: "4回目塔踏み",
            6: "過去/未来誘導",
            7: "5回目塔踏み",
            8: "6回目塔踏み",
            9: "過去/未来誘導",
            10: "7回目塔踏み",
            11: "8回目塔踏み",
            12: "過去/未来誘導"
        }
        
        phase_name = phase_names.get(ph_num, "")
        self.phase_type_lbl.config(text=f"({phase_name})")
        
        if ph_num in [3, 6, 9, 12]:
            self.btn_add_widget.config(state=tk.DISABLED)
            self.btn_del_widget.config(state=tk.DISABLED)
            self.disable_button_detail_frame()
            self.disable_change_targets_frame()
        else:
            self.btn_add_widget.config(state=tk.NORMAL)
            self.btn_del_widget.config(state=tk.NORMAL)
            
            self.enable_change_targets_frame()
            if ph_num in [10, 11]:
                self.phase_type_lbl.config(text=self.phase_type_lbl.cget("text") + " - マーカー消滅")
                
        self.selected_button_index = -1
        self.sync_button_list()
        self.sync_change_group()
        self.draw_canvas()

    def sync_button_list(self):
        self.btn_listbox.delete(0, tk.END)
        ph = self.config_data.get("phases", {}).get(self.current_phase, {})
        buttons = ph.get("buttons", [])
        
        for idx, btn in enumerate(buttons):
            self.btn_listbox.insert(tk.END, f"{idx+1}: {btn.get('label')} ({btn.get('condition')})")
            
        self.disable_button_detail_frame()

    def sync_change_group(self):
        ph = self.config_data.get("phases", {}).get(self.current_phase, {})
        group = ph.get("change_target_group", "")
        self.target_group_var.set(group)

    def on_target_group_change(self):
        ph = self.config_data.setdefault("phases", {}).setdefault(self.current_phase, {})
        ph["change_target_group"] = self.target_group_var.get()

    def disable_change_targets_frame(self):
        self.target_group_var.set("")
        for child in self.change_lf.winfo_children():
            if isinstance(child, ttk.Radiobutton):
                child.config(state=tk.DISABLED)

    def enable_change_targets_frame(self):
        for child in self.change_lf.winfo_children():
            if isinstance(child, ttk.Radiobutton):
                child.config(state=tk.NORMAL)

    def disable_button_detail_frame(self):
        self.btn_label_var.set("")
        self.btn_x_var.set("")
        self.btn_y_var.set("")
        self.btn_w_var.set("")
        self.btn_h_var.set("")
        self.btn_cond_var.set("")
        for child in self.btn_detail_frame.winfo_children():
            if isinstance(child, (ttk.Entry, ttk.Button)):
                child.config(state=tk.DISABLED)

    def enable_button_detail_frame(self):
        for child in self.btn_detail_frame.winfo_children():
            if isinstance(child, (ttk.Entry, ttk.Button)):
                child.config(state=tk.NORMAL)

    # ボタン管理
    def add_button(self):
        ph = self.config_data.setdefault("phases", {}).setdefault(self.current_phase, {})
        buttons = ph.setdefault("buttons", [])
        
        # 新しいボタンを中心基準の座標で追加 (画面中央 512, 280)
        new_btn = {
            "id": f"btn_{self.current_phase}_{len(buttons)+1}",
            "label": f"ボタン {len(buttons)+1}",
            "x": 512,
            "y": 280,
            "w": 100,
            "h": 40,
            "condition": ""
        }
        buttons.append(new_btn)
        
        self.sync_button_list()
        self.btn_listbox.select_set(len(buttons)-1)
        self.on_button_select(None)
        self.draw_canvas()

    def delete_button(self):
        if self.selected_button_index == -1:
            messagebox.showwarning("警告", "削除するボタンを選択してください。")
            return
            
        ph = self.config_data.get("phases", {}).get(self.current_phase, {})
        buttons = ph.get("buttons", [])
        
        if 0 <= self.selected_button_index < len(buttons):
            del buttons[self.selected_button_index]
            self.selected_button_index = -1
            self.sync_button_list()
            self.draw_canvas()

    def on_button_select(self, event):
        selection = self.btn_listbox.curselection()
        if not selection:
            return
            
        self.selected_button_index = selection[0]
        ph = self.config_data.get("phases", {}).get(self.current_phase, {})
        buttons = ph.get("buttons", [])
        
        if 0 <= self.selected_button_index < len(buttons):
            self.enable_button_detail_frame()
            btn = buttons[self.selected_button_index]
            self.btn_label_var.set(btn.get("label", ""))
            self.btn_x_var.set(str(btn.get("x", 0)))
            self.btn_y_var.set(str(btn.get("y", 0)))
            self.btn_w_var.set(str(btn.get("w", 100)))
            self.btn_h_var.set(str(btn.get("h", 40)))
            self.btn_cond_var.set(btn.get("condition", ""))
            self.draw_canvas()

    def apply_button_details(self):
        if self.selected_button_index == -1:
            return
            
        ph = self.config_data.get("phases", {}).get(self.current_phase, {})
        buttons = ph.get("buttons", [])
        
        if 0 <= self.selected_button_index < len(buttons):
            cond = self.btn_cond_var.get()
            is_valid, err_msg = validate_condition(cond)
            if not is_valid:
                if not messagebox.askyesno("構文警告", f"条件式に問題があります:\n{err_msg}\n\nこのまま適用しますか？"):
                    return
            
            try:
                buttons[self.selected_button_index] = {
                    "id": buttons[self.selected_button_index]["id"],
                    "label": self.btn_label_var.get(),
                    "x": int(self.btn_x_var.get()),
                    "y": int(self.btn_y_var.get()),
                    "w": int(self.btn_w_var.get()),
                    "h": int(self.btn_h_var.get()),
                    "condition": cond
                }
                self.sync_button_list()
                self.btn_listbox.select_set(self.selected_button_index)
                self.draw_canvas()
            except ValueError:
                messagebox.showerror("エラー", "X, Y, W, Hには整数を入力してください。")

    def check_condition_syntax(self):
        cond = self.btn_cond_var.get()
        is_valid, err_msg = validate_condition(cond)
        if is_valid:
            messagebox.showinfo("構文チェック", "条件式の構文は正しいです！")
        else:
            messagebox.showerror("構文エラー", f"条件式に問題があります:\n{err_msg}")

    # キャンバス描画
    def draw_canvas(self):
        self.canvas.delete("all")
        
        boss = self.config_data.get("boss", {"x": 512, "y": 180, "radius": 50})
        cl = self.config_data.get("circle_left", {"x": 350, "y": 380, "radius": 70})
        cr = self.config_data.get("circle_right", {"x": 674, "y": 380, "radius": 70})
        
        self.draw_circle(cl["x"], cl["y"], cl["radius"], "#2a4d2a", "circle_left", "左塔")
        self.draw_circle(cr["x"], cr["y"], cr["radius"], "#2a2d4d", "circle_right", "右塔")
        self.draw_circle(boss["x"], boss["y"], boss["radius"], "#4d2a2a", "boss", "BOSS")
        
        ph_num = int(self.current_phase)
        if ph_num in [3, 6, 9, 12]:
            # 自動配置ボタンも中央基準で描画
            self.canvas.create_rectangle(boss["x"]-60, boss["y"]-105, boss["x"]+60, boss["y"]-65, fill="#333333", outline="#aaaaaa", width=1, dash=(2, 2))
            self.canvas.create_text(boss["x"], boss["y"]-85, text="未来の終焉用 (自動配置)", fill="#888888", font=("MS Gothic", 8))
            
            mid_x = (cl["x"] + cr["x"]) // 2
            mid_y = (cl["y"] + cr["y"]) // 2
            self.canvas.create_rectangle(mid_x-60, mid_y-20, mid_x+60, mid_y+20, fill="#333333", outline="#aaaaaa", width=1, dash=(2, 2))
            self.canvas.create_text(mid_x, mid_y, text="過去の終焉用 (自動配置)", fill="#888888", font=("MS Gothic", 8))
        else:
            ph = self.config_data.get("phases", {}).get(self.current_phase, {})
            buttons = ph.get("buttons", [])
            
            for idx, btn in enumerate(buttons):
                bw, bh = btn["w"], btn["h"]
                # 中央基準から左上角を算出
                bx = btn["x"] - bw // 2
                by = btn["y"] - bh // 2
                
                is_selected = (idx == self.selected_button_index)
                fill_color = "#3a4f66" if is_selected else "#253344"
                outline_color = "#00ffff" if is_selected else "#4d6d8f"
                width = 2 if is_selected else 1
                
                self.canvas.create_rectangle(bx, by, bx+bw, by+bh, fill=fill_color, outline=outline_color, width=width, tags=f"btn_{idx}")
                self.canvas.create_text(btn["x"], btn["y"], text=btn["label"], fill="#ffffff", tags=f"btn_{idx}", font=("MS Gothic", 9, "bold"))
                
                if is_selected:
                    hx, hy = btn["x"] + bw // 2, btn["y"] + bh // 2
                    self.canvas.create_rectangle(hx-4, hy-4, hx+4, hy+4, fill="#00ffff", outline="#ffffff", tags="resize_handle")

    def draw_circle(self, x, y, r, fill, tag, label):
        self.canvas.create_oval(x-r, y-r, x+r, y+r, fill=fill, outline="#aaaaaa", width=1, tags=tag)
        self.canvas.create_text(x, y, text=label, fill="#ffffff", tags=tag, font=("MS Gothic", 10, "bold"))

    # ドラッグ＆ドロップロジック
    def on_canvas_press(self, event):
        items = self.canvas.find_withtag(tk.CURRENT)
        if not items:
            self.drag_target = None
            return
            
        item = items[0]
        tags = self.canvas.gettags(item)
        
        self.drag_start_x = event.x
        self.drag_start_y = event.y
        
        if "resize_handle" in tags:
            self.drag_target = "resize_handle"
        elif "boss" in tags:
            self.drag_target = "boss"
        elif "circle_left" in tags:
            self.drag_target = "circle_left"
        elif "circle_right" in tags:
            self.drag_target = "circle_right"
        else:
            for tag in tags:
                if tag.startswith("btn_"):
                    btn_idx = int(tag.split("_")[1])
                    self.drag_target = f"btn_{btn_idx}"
                    self.btn_listbox.selection_clear(0, tk.END)
                    self.btn_listbox.select_set(btn_idx)
                    self.selected_button_index = btn_idx
                    self.on_button_select(None)
                    break

    def on_canvas_drag(self, event):
        if not self.drag_target:
            return
            
        dx = event.x - self.drag_start_x
        dy = event.y - self.drag_start_y
        
        self.drag_start_x = event.x
        self.drag_start_y = event.y
        
        if self.drag_target == "boss":
            self.config_data["boss"]["x"] += dx
            self.config_data["boss"]["y"] += dy
            self.sync_base_inputs()
            self.draw_canvas()
        elif self.drag_target == "circle_left":
            self.config_data["circle_left"]["x"] += dx
            self.config_data["circle_left"]["y"] += dy
            self.sync_base_inputs()
            self.draw_canvas()
        elif self.drag_target == "circle_right":
            self.config_data["circle_right"]["x"] += dx
            self.config_data["circle_right"]["y"] += dy
            self.sync_base_inputs()
            self.draw_canvas()
        elif self.drag_target.startswith("btn_"):
            btn_idx = int(self.drag_target.split("_")[1])
            ph = self.config_data.get("phases", {}).get(self.current_phase, {})
            buttons = ph.get("buttons", [])
            if 0 <= btn_idx < len(buttons):
                buttons[btn_idx]["x"] += dx
                buttons[btn_idx]["y"] += dy
                
                self.btn_x_var.set(str(buttons[btn_idx]["x"]))
                self.btn_y_var.set(str(buttons[btn_idx]["y"]))
                self.draw_canvas()
        elif self.drag_target == "resize_handle":
            ph = self.config_data.get("phases", {}).get(self.current_phase, {})
            buttons = ph.get("buttons", [])
            if 0 <= self.selected_button_index < len(buttons):
                btn = buttons[self.selected_button_index]
                # 左上角を固定して右下のみをリサイズ
                new_w = max(10, btn["w"] + dx)
                new_h = max(10, btn["h"] + dy)
                actual_dw = new_w - btn["w"]
                actual_dh = new_h - btn["h"]
                
                btn["w"] = new_w
                btn["h"] = new_h
                btn["x"] += actual_dw // 2
                btn["y"] += actual_dh // 2
                
                self.btn_x_var.set(str(btn["x"]))
                self.btn_y_var.set(str(btn["y"]))
                self.btn_w_var.set(str(btn["w"]))
                self.btn_h_var.set(str(btn["h"]))
                self.draw_canvas()

    def on_canvas_release(self, event):
        self.drag_target = None


if __name__ == "__main__":
    root = tk.Tk()
    app = AdjusterApp(root)
    root.mainloop()
