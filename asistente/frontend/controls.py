"""Voice sliders sharing the player's blue progress-bar appearance."""
import tkinter as tk


class BlueSlider(tk.Canvas):
    def __init__(self, parent, *, variable, minimum, maximum, step=1, colors, command=None):
        super().__init__(parent, height=26, bg=colors['background'], highlightthickness=0, takefocus=True)
        self.variable, self.minimum, self.maximum = variable, minimum, maximum
        self.step, self.colors, self.command = step, colors, command
        self._trace = variable.trace_add('write', self._changed)
        self.bind('<Configure>', lambda event: self._draw())
        self.bind('<ButtonPress-1>', self._point)
        self.bind('<B1-Motion>', self._point)
        for key, delta in (('<Left>',-step),('<Right>',step),('<Down>',-step),('<Up>',step)):
            self.bind(key, lambda event, amount=delta: self._set(self.variable.get()+amount))
        self.bind('<Home>',lambda event:self._set(self.minimum))
        self.bind('<End>',lambda event:self._set(self.maximum))
        self.bind('<Destroy>',self._cleanup)

    def _cleanup(self,event):
        if event.widget is self:
            self.variable.trace_remove('write',self._trace)

    def _changed(self,*args):
        self._draw()
        if self.command:
            self.command(self.variable.get())

    def _draw(self):
        left,right,y=9,max(10,self.winfo_width()-9),13
        fraction=max(0,min(1,(self.variable.get()-self.minimum)/(self.maximum-self.minimum)))
        x=left+(right-left)*fraction
        self.delete('all')
        self.create_line(left,y,right,y,fill=self.colors['border'],width=4,capstyle='round')
        if x>left:
            self.create_line(left,y,x,y,fill='#66C7FF',width=4,capstyle='round')
        self.create_oval(x-5,y-5,x+5,y+5,fill=self.colors['text'],outline='')

    def _set(self,value):
        value=round((max(self.minimum,min(self.maximum,value))-self.minimum)/self.step)*self.step+self.minimum
        self.variable.set(max(self.minimum,min(self.maximum,value)))
        return 'break'

    def _point(self,event):
        guard = getattr(self.winfo_toplevel(), "_noactivate_guard", None)
        if guard is None or not guard.enabled:
            self.focus_set()
        fraction=max(0,min(1,(event.x-9)/max(1,self.winfo_width()-18)))
        return self._set(self.minimum+fraction*(self.maximum-self.minimum))


class MicrophoneSignal:
    """Mantener el estado durante pausas breves, sin confundir silencio y fallo."""
    def __init__(self):
        self.active_until = 0.0
        self.zero_since = None

    def update(self, level, now):
        if level >= 30:
            self.active_until = now + 2.5
        if level == 0:
            if self.zero_since is None:
                self.zero_since = now
        else:
            self.zero_since = None
        if now < self.active_until:
            return "El micrófono está recibiendo sonido"
        if self.zero_since is not None and now - self.zero_since >= 8:
            return "No llega audio del micrófono desde hace varios segundos"
        return "Micrófono listo · esperando voz"
