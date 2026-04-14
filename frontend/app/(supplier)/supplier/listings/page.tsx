'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Plus, Package, Star, Edit2, Trash2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { TopBar } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/Pagination'
import { ConfirmModal } from '@/components/ui/Modal'
import { useDisclosure } from '@/hooks'
import { useFetch } from '@/hooks'
import { productsApi } from '@/lib/api-hooks'
import { formatCurrency } from '@/lib/format'
import type { Product } from '@/types'

export default function SupplierListingsPage() {
  const { data, loading, error, refetch } = useFetch<{ items: Product[] }>('/api/products/my/listings')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const deleteModal = useDisclosure()
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const handleDelete = async () => {
    if (!selectedProduct) return
    setDeletingId(selectedProduct._id)
    try {
      await productsApi.delete(selectedProduct._id)
      toast.success('Listing removed.')
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to delete')
    } finally {
      setDeletingId(null)
      deleteModal.close()
      setSelectedProduct(null)
    }
  }

  const handleToggleAvailability = async (product: Product) => {
    setTogglingId(product._id)
    try {
      await productsApi.update(product._id, { isAvailable: !product.isAvailable })
      toast.success(product.isAvailable ? 'Listing paused.' : 'Listing activated.')
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to update')
    } finally {
      setTogglingId(null)
    }
  }

  const products = data?.items ?? []

  return (
    <div>
      <TopBar
        title="My Listings"
        subtitle={`${products.length} product${products.length !== 1 ? 's' : ''} listed`}
        actions={
          <Link href="/supplier/listings/new">
            <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}>
              New listing
            </Button>
          </Link>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package className="w-5 h-5" />}
          title="No listings yet"
          description="Create your first product or service listing to start receiving RFQs from buyers."
          action={
            <Link href="/supplier/listings/new">
              <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}>Create listing</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map((product) => {
            const images = product.images ?? []

            return (
              <Card key={product._id} padding="none" className="overflow-hidden">
              {/* Image */}
              <div className="relative h-40 bg-gray-100">
                {images[0] ? (
                  <Image src={images[0]} alt={product.name} fill
                    className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Package className="w-10 h-10" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1.5">
                  {!product.isAvailable && (
                    <span className="bg-gray-900/70 text-white text-2xs px-2 py-0.5 rounded-full font-medium">
                      Paused
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold text-gray-900">
                      {formatCurrency(product.basePrice)}
                    </p>
                    <p className="text-2xs text-gray-400">{product.priceUnit}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {product.averageRating.toFixed(1)} ({product.totalReviews})
                  </span>
                  {product.isNegotiable && (
                    <Badge variant="default" className="text-2xs">Negotiable</Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 mt-4 pt-3 border-t border-gray-100">
                  <Link href={`/supplier/listings/${product._id}/edit`} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full"
                      iconLeft={<Edit2 className="w-3.5 h-3.5" />}>
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost" size="sm"
                    loading={togglingId === product._id}
                    iconLeft={product.isAvailable
                      ? <EyeOff className="w-3.5 h-3.5" />
                      : <Eye className="w-3.5 h-3.5" />}
                    onClick={() => handleToggleAvailability(product)}
                    title={product.isAvailable ? 'Pause listing' : 'Activate listing'}
                  >
                    {product.isAvailable ? 'Pause' : 'Activate'}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    className="text-red-400 hover:bg-red-50 hover:text-red-600"
                    iconLeft={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => { setSelectedProduct(product); deleteModal.open() }}
                    title="Delete listing"
                  />
                </div>
              </div>
            </Card>
            )
          })}
        </div>
      )}

      <ConfirmModal
        open={deleteModal.isOpen}
        onClose={() => { deleteModal.close(); setSelectedProduct(null) }}
        onConfirm={handleDelete}
        loading={!!deletingId}
        title="Delete listing?"
        message={`"${selectedProduct?.name}" will be soft-deleted. You can restore it from admin if needed.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}