"""Sección de ajustes con texto alineado, sin iconos."""
import tkinter as tk


class SectionButton(tk.Frame):
    def __init__(self, parent, *, text, command, fg, bg, font):
        super().__init__(parent, height=42, bg=bg, cursor='hand2', takefocus=True)
        self.command = command
        self.pack_propagate(False)
        self.grid_propagate(False)
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self.label = tk.Label(self, text=text, font=font, fg=fg, bg=bg, anchor='w', justify='left',
                              wraplength=150, padx=0, pady=0, cursor='hand2')
        self.label.grid(row=0, column=0, sticky='ew', padx=12)
        for widget in (self, self.label):
            widget.bind('<Button-1>', lambda event: self.invoke())
        self.bind('<Return>', lambda event: self.invoke())
        self.bind('<space>', lambda event: self.invoke())
        self.bind('<Configure>', lambda event: self.label.configure(wraplength=max(50, event.width - 24)))

    def invoke(self):
        self.command()

    def configure(self, cnf=None, **kwargs):
        options = dict(cnf or {}, **kwargs)
        font = options.pop('font', None)
        super().configure(**options)
        if hasattr(self, 'label'):
            if 'bg' in options:
                self.label.configure(bg=options['bg'])
            if font is not None:
                self.label.configure(font=font)
