'use client'

import { useState } from 'react'
import { Bell, CheckCheck, Package, FileText, CreditCard, Star, MessageSquare } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { TopBar } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/Pagination'
import { useFetch } from '@/hooks'
import { notificationsApi } from '@/lib/api-hooks'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

const ICON_MAP: Record<string, React.ReactNode> = {
  rfq:            <FileText className="w-4 h-4" />,
  purchase_order: <Package className="w-4 h-4" />,
  loan:           <CreditCard className="w-4 h-4" />,
  review:         <Star className="w-4 h-4" />,
  message:        <MessageSquare className="w-4 h-4" />,
}

export default function NotificationsPage() {
  const { data, loading, error, refetch } =
    useFetch<{ items: Notification[] }>('/api/notifications')
  const [markingAll, setMarkingAll] = useState(false)

  const notifications = data?.items ?? []
  const unreadCount   = notifications.filter((n) => !n.isRead).length

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id)
      refetch()
    } catch { /* silent */ }
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await notificationsApi.markAllRead()
      toast.success('All notifications marked as read.')
      refetch()
    } catch (err: any) {
      toast.error('Failed to mark all as read')
    } finally { setMarkingAll(false) }
  }

  return (
    <div>
      <TopBar
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        actions={
          unreadCount > 0 ? (
            <Button variant="ghost" size="sm" loading={markingAll}
              iconLeft={<CheckCheck className="w-3.5 h-3.5" />}
              onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {error ? <ErrorState message={error} onRetry={refetch} /> :
       loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-gray-200 animate-skeleton" />
          ))}
        </div>
       ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-5 h-5" />}
          title="No notifications"
          description="You're all caught up. Notifications about orders, RFQs, and loans will appear here."
        />
       ) : (
        <div className="space-y-1.5">
          {notifications.map((n) => (
            <div
              key={n._id}
              onClick={() => !n.isRead && handleMarkRead(n._id)}
              className={cn(
                'flex items-start gap-4 px-5 py-4 rounded-xl border transition-colors cursor-pointer',
                n.isRead
                  ? 'bg-white border-gray-200 hover:border-gray-300'
                  : 'bg-indigo-50/60 border-indigo-100 hover:bg-indigo-50'
              )}
            >
              {/* Icon */}
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                n.isRead ? 'bg-gray-100 text-gray-400' : 'bg-indigo-100 text-indigo-600'
              )}>
                {ICON_MAP[n.entityType ?? ''] ?? <Bell className="w-4 h-4" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm', n.isRead ? 'text-gray-700' : 'text-gray-900 font-medium')}>
                  {n.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">{formatRelative(n.createdAt)}</p>
              </div>

              {/* Unread dot */}
              {!n.isRead && (
                <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-2" />
              )}
            </div>
          ))}
        </div>
       )}
    </div>
  )
}