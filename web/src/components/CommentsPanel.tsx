// 歌曲评论：右侧竖排 tab + 面板（数据来自网易云评论）
import { useEffect, useState } from 'react'
import { useApp } from '../stores/appStore'
import { usePlayer } from '../stores/playerStore'
import { get } from '../services/api'

interface Comment {
  commentId: number
  content: string
  likedCount: number
  time: number
  user?: { nickname?: string }
}

export function CommentsPanel() {
  const { commentsOpen, setCommentsOpen } = useApp()
  const song = usePlayer((s) => s.songs[0])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!commentsOpen || !song) return
    setLoading(true)
    get<{ comments?: Comment[]; hotComments?: Comment[] }>(`/api/comments?id=${song.id}`)
      .then((data) => setComments([...(data.hotComments || []), ...(data.comments || [])].slice(0, 30)))
      .catch(() => setComments([]))
      .finally(() => setLoading(false))
  }, [commentsOpen, song?.id])

  return (
    <>
      <button className="side-tab" onClick={() => setCommentsOpen(!commentsOpen)} title="歌曲评论">
        歌曲评论
      </button>
      {commentsOpen && song && (
        <div className="comments-panel">
          <div className="comments-head">
            <span>《{song.name}》评论</span>
            <button onClick={() => setCommentsOpen(false)}>✕</button>
          </div>
          <div className="comments-list">
            {loading && <div className="hint">加载中…</div>}
            {!loading && !comments.length && <div className="hint">暂无评论</div>}
            {comments.map((c) => (
              <div className="comment-item" key={c.commentId}>
                <span className="time">{new Date(c.time).toLocaleDateString()}</span>
                <span className="who">{c.user?.nickname || '匿名'}</span>
                {c.content}
                <span className="liked">♥{c.likedCount || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
