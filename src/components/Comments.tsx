import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { deleteComment, fetchComments, postComment } from '../lib/comments';
import type { Comment } from '../lib/types';
import './Comments.css';

interface Props {
  albumId: string | null;
  onRequestSignIn: () => void;
}

const MAX = 4000;

const when = (iso: string) => {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 30) return `${Math.round(mins / (60 * 24))}d ago`;
  return new Date(iso).toLocaleDateString();
};

/** Discussion under a record. One flat thread plus one level of replies. */
export default function Comments({ albumId, onRequestSignIn }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!albumId) return;
    fetchComments(albumId)
      .then(setComments)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load comments.'),
      );
  }, [albumId]);

  useEffect(load, [load]);

  const submit = async (event: FormEvent, text: string, parentId: string | null) => {
    event.preventDefault();
    if (!user || !albumId || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await postComment(albumId, user.id, text, parentId);
      setBody('');
      setReplyBody('');
      setReplyTo(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post that.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!user) return;
    try {
      await deleteComment(id, user.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that.');
    }
  };

  if (!albumId) return null;

  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  return (
    <section className="comments" aria-label="Discussion">
      <h2 className="section-title">
        Discussion{comments.length > 0 ? ` · ${comments.length}` : ''}
      </h2>

      {user ? (
        <form className="comments-form" onSubmit={(e) => void submit(e, body, null)}>
          <textarea
            className="input comments-input"
            placeholder="What did you make of this record?"
            value={body}
            maxLength={MAX}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="comments-formfoot">
            <span className="muted comments-count">
              {body.length}/{MAX}
            </span>
            <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <div className="card comments-signin">
          <span className="secondary">Sign in to join the discussion.</span>
          <button type="button" className="btn btn-primary" onClick={onRequestSignIn}>
            Sign in
          </button>
        </div>
      )}

      {error && (
        <p className="comments-error" role="alert">
          {error}
        </p>
      )}

      {roots.length === 0 ? (
        <p className="muted comments-empty">No comments yet. Start it off.</p>
      ) : (
        <ul className="comments-list">
          {roots.map((c) => (
            <li key={c.id}>
              <CommentRow
                comment={c}
                mine={c.userId === user?.id}
                onDelete={() => void remove(c.id)}
                onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
                canReply={Boolean(user)}
              />

              {replyTo === c.id && user && (
                <form
                  className="comments-form comments-reply"
                  onSubmit={(e) => void submit(e, replyBody, c.id)}
                >
                  <textarea
                    className="input comments-input"
                    placeholder={`Reply to ${c.authorName}…`}
                    value={replyBody}
                    maxLength={MAX}
                    rows={2}
                    onChange={(e) => setReplyBody(e.target.value)}
                  />
                  <div className="comments-formfoot">
                    <button type="button" className="btn" onClick={() => setReplyTo(null)}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={busy || !replyBody.trim()}
                    >
                      Reply
                    </button>
                  </div>
                </form>
              )}

              {repliesOf(c.id).length > 0 && (
                <ul className="comments-replies">
                  {repliesOf(c.id).map((r) => (
                    <li key={r.id}>
                      <CommentRow
                        comment={r}
                        mine={r.userId === user?.id}
                        onDelete={() => void remove(r.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface RowProps {
  comment: Comment;
  mine: boolean;
  onDelete: () => void;
  onReply?: () => void;
  canReply?: boolean;
}

function CommentRow({ comment, mine, onDelete, onReply, canReply }: RowProps) {
  const initial = comment.authorName.slice(0, 1).toUpperCase();
  return (
    <article className="comment">
      <span className="comment-avatar" aria-hidden="true">
        {comment.authorAvatar ? <img src={comment.authorAvatar} alt="" /> : initial}
      </span>
      <div className="comment-body">
        <div className="comment-meta">
          <span className="comment-author">{comment.authorName}</span>
          <span className="muted">{when(comment.createdAt)}</span>
        </div>
        {/* Rendered as text, never as markup. */}
        <p className="comment-text">{comment.body}</p>
        <div className="comment-actions">
          {onReply && canReply && (
            <button type="button" className="comment-action" onClick={onReply}>
              Reply
            </button>
          )}
          {mine && (
            <button type="button" className="comment-action" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
