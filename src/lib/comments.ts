/**
 * Album discussion. Like ratings, comments are written straight from the browser
 * under the user's own JWT — RLS pins `user_id` to `auth.uid()`, so a client
 * cannot post as anyone else.
 */
import { supabase } from './supabase';
import type { Comment } from './types';

interface Row {
  id: string;
  album_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
}

const toComment = (r: Row): Comment => ({
  id: r.id,
  albumId: r.album_id,
  userId: r.user_id,
  parentId: r.parent_id,
  body: r.body,
  createdAt: r.created_at,
  authorName: r.author_name ?? 'listener',
  authorAvatar: r.author_avatar,
});

export async function fetchComments(albumId: string): Promise<Comment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('v_comments')
    .select('id, album_id, user_id, parent_id, body, created_at, author_name, author_avatar')
    .eq('album_id', albumId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toComment(r as Row));
}

export async function postComment(
  albumId: string,
  userId: string,
  body: string,
  parentId: string | null = null,
): Promise<void> {
  if (!supabase) throw new Error('Comments are unavailable: Supabase is not configured.');
  const { error } = await supabase
    .from('comments')
    .insert({ album_id: albumId, user_id: userId, body: body.trim(), parent_id: parentId });
  if (error) throw new Error(error.message);
}

export async function deleteComment(id: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('comments').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
