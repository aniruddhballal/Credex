'use client'

import { useParams } from 'next/navigation'
import { Breadcrumb } from '@/components/shared/Sidebar'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/Pagination'
import { useFetch } from '@/hooks'
import ListingForm from '@/components/supplier/ListingForm'
import type { Product } from '@/types'

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const { data: product, loading, error, refetch } = useFetch<Product>(`/api/products/${id}`)

  if (loading) return <SkeletonCard />
  if (error || !product) return <ErrorState onRetry={refetch} />

  return (
    <div>
      <Breadcrumb crumbs={[
        { label: 'My Listings', href: '/supplier/listings' },
        { label: product.name, href: `/supplier/listings` },
        { label: 'Edit' },
      ]} />
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Edit listing</h1>
      <ListingForm product={product} />
    </div>
  )
}