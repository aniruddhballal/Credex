import User from '../models/User'
import Company from '../models/Company'
import { ICompany } from '../models/Company'

export interface CompanyLookupResult {
  company: ICompany | null
  setupRequired: boolean
}

/**
 * Looks up the company linked to a user.
 * Returns { company, setupRequired } — never throws for missing company.
 * Use this in dashboard and read endpoints where onboarding state is valid.
 */
export const getUserCompany = async (userId: string): Promise<CompanyLookupResult> => {
  const user = await User.findById(userId)
  if (!user?.companyId) return { company: null, setupRequired: true }

  const company = await Company.findOne({ _id: user.companyId, isDeleted: false })
  if (!company) return { company: null, setupRequired: true }

  return { company, setupRequired: false }
}

/**
 * Same as getUserCompany but throws a structured error when no company is found.
 * Use this in transactional endpoints (RFQ, PO, products) where a company is
 * a hard prerequisite — not an onboarding state.
 */
export class CompanyRequiredError extends Error {
  public readonly statusCode = 422
  constructor() {
    super('Company setup required before performing this action')
    this.name = 'CompanyRequiredError'
  }
}

export const requireUserCompany = async (userId: string): Promise<ICompany> => {
  const { company, setupRequired } = await getUserCompany(userId)
  if (setupRequired || !company) throw new CompanyRequiredError()
  return company
}