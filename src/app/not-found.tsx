import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto py-10">
      <div className="receipt relative">
        <p className="label">Form 404 · misfiled</p>
        <h1 className="text-4xl font-medium mt-1">Nothing on this docket</h1>
        <p className="text-ink-2 mt-3">
          The page, bounty or PatchProof you asked for is not in the ledger. It may have been a mistyped
          hash, or it was never filed.
        </p>
        <div className="border-t border-dashed rule my-4" />
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="btn btn-ink">Back to the ledger</Link>
          <Link href="/new" className="btn">Post a bounty</Link>
        </div>
        <span className="stamp text-del absolute right-5 -bottom-2">void</span>
      </div>
    </div>
  );
}
