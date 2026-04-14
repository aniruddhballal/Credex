'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, SlidersHorizontal, Star, MapPin, ShieldCheck, X } from 'lucide-react'
import { TopBar } from '@/components/shared/Sidebar'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/Pagination'
import { usePaginated, useDebounce, useDisclosure } from '@/hooks'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product } from '@/types'

const CATEGORIES = [
  'All', 'Steel & Metals', 'Textiles', 'Electronics', 'Chemicals',
  'Machinery', 'Plastics', 'Paper & Packaging', 'Logistics', 'IT Services',
]

const FINANCING_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'deferred_30', label: '30-day deferred' },
  { value: 'deferred_60', label: '60-day deferred' },
  { value: 'deferred_90', label: '90-day deferred' },
  { value: 'installment', label: 'Installment' },
  { value: 'loan', label: 'Loan' },
]

export default function DiscoverPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [minRating, setMinRating] = useState<number | undefined>()
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [financing, setFinancing] = useState<string | undefined>()
  const filtersOpen = useDisclosure()

  const debouncedSearch = useDebounce(search, 350)

  const extraParams: Record<string, string> = {}
  if (debouncedSearch) extraParams.search = debouncedSearch
  if (category !== 'All') extraParams.category = category
  if (minRating) extraParams.minRating = String(minRating)
  if (verifiedOnly) extraParams.isVerified = 'true'
  if (financing) extraParams.financingMethod = financing

  const { items: products, loading, error, hasNext, hasPrev, onNext, onPrev } =
    usePaginated<Product>('/api/products', 20, extraParams)

  const clearFilters = () => {
    setCategory('All')
    setMinRating(undefined)
    setVerifiedOnly(false)
    setFinancing(undefined)
  }

  const activeFilterCount = [
    category !== 'All', !!minRating, verifiedOnly, !!financing
  ].filter(Boolean).length

  return (
    <div>
      <TopBar
        title="Discover Suppliers"
        subtitle="Find verified suppliers across India and place your RFQs."
      />

      {/* Search + filter bar */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1">
          <Input
            placeholder="Search products, suppliers, categories…"
            iconLeft={<Search className="w-4 h-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          iconLeft={<SlidersHorizontal className="w-4 h-4" />}
          onClick={filtersOpen.toggle}
          className={cn(activeFilterCount > 0 && 'border-indigo-300 text-indigo-600')}
        >
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 bg-indigo-500 text-white text-2xs px-1.5 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              'shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors border',
              category === cat
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      {filtersOpen.isOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
            <div className="flex gap-2">
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear all
                </button>
              )}
              <button onClick={filtersOpen.close} className="text-xs text-gray-400 hover:text-gray-600">
                Done
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Min rating */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Minimum rating</p>
              <div className="flex gap-1.5">
                {[0, 3, 3.5, 4, 4.5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setMinRating(r === 0 ? undefined : r)}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors',
                      minRating === r || (r === 0 && !minRating)
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    {r === 0 ? 'Any' : <><Star className="w-3 h-3 fill-current" />{r}+</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Financing method */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Financing method</p>
              <select
                value={financing ?? ''}
                onChange={(e) => setFinancing(e.target.value || undefined)}
                className="w-full h-8 rounded-lg border border-gray-200 px-2.5 text-xs text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Any</option>
                {FINANCING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Verified only */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Verification</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Verified suppliers only
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          description="Try adjusting your search or filters."
          action={<Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination hasNext={hasNext} hasPrev={hasPrev} onNext={onNext} onPrev={onPrev} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const supplier = typeof product.supplierId === 'object' ? product.supplierId : null
  const images = product.images ?? []
  const financing = product.acceptedFinancingMethods ?? []
  return (
    <Link href={`/buyer/discover/${product._id}`}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card hover:shadow-md transition-shadow overflow-hidden group">
        {/* Image */}
        <div className="relative h-44 bg-gray-100 overflow-hidden">
          {images[0] ? (
            <Image
              src={images[0]}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          )}
          {product.isNegotiable && (
            <span className="absolute top-2 left-2 bg-indigo-600 text-white text-2xs font-semibold px-2 py-0.5 rounded-full">
              Negotiable
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
              {supplier && (
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-xs text-gray-500 truncate">{(supplier as any).name}</p>
                  {(supplier as any).isVerified && (
                    <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                  )}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-gray-900 font-mono">
                {formatCurrency(product.basePrice)}
              </p>
              <p className="text-2xs text-gray-400">{product.priceUnit}</p>
            </div>
          </div>

          {/* Rating + location */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="text-xs font-medium text-gray-700">
                {product.averageRating.toFixed(1)}
              </span>
              <span className="text-xs text-gray-400">({product.totalReviews})</span>
            </div>
            {supplier && (supplier as any).city && (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <MapPin className="w-3 h-3" />
                {(supplier as any).city}
              </div>
            )}
          </div>

          {/* Financing tags */}
          {financing.length > 0 && (
            <div className="flex gap-1 mt-3 overflow-hidden">
              {financing.slice(0, 2).map((m) => (
                <Badge key={m} variant="muted" className="text-2xs">
                  {m.replace(/_/g, ' ')}
                </Badge>
              ))}
              {financing.length > 2 && (
                <Badge variant="muted" className="text-2xs">
                    +{financing.length - 2} more
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}