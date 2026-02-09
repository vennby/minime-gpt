import { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

export default function TextEditor() {
  const [title, setTitle] = useState('Untitled document');
  const editorHostRef = useRef(null);

  useEffect(() => {
    if (editorHostRef.current === null) return;

    editorHostRef.current.innerHTML = '';
    const editorEl = document.createElement('div');
    editorHostRef.current.append(editorEl);

    const toolbarOptions = [
      [{ font: [] }, { size: ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ header: 1 }, { header: 2 }, 'blockquote'],
      [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
      [{ align: [] }],
      ['link', 'image'],
      ['clean'],
    ];

    new Quill(editorEl, {
      theme: 'snow',
      placeholder: 'Start typing your doc...',
      modules: {
        toolbar: toolbarOptions,
      },
    });
  }, []);

  return (
    <div className="workspace">
      <div className="docs-chrome">
        <div className="topbar">
          <div className="title-stack">
            <div className="title-dot" aria-hidden="true" />
            <input
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Document name"
            />
          </div>
          <div className="topbar-actions">
            <button className="chip ghost">Comments</button>
            <button className="chip primary">Share</button>
          </div>
        </div>
      </div>
      <div className="editor-shell">
        <div className="page" ref={editorHostRef}></div>
      </div>
    </div>
  );
}