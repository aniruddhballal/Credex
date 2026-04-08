import { Breadcrumb } from '@/components/shared/Sidebar'
import ListingForm from '@/components/supplier/ListingForm'

export default function NewListingPage() {
  return (
    <div>
      <Breadcrumb crumbs={[
        { label: 'My Listings', href: '/supplier/listings' },
        { label: 'New listing' },
      ]} />
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Create a new listing</h1>
      <ListingForm />
    </div>
  )
}