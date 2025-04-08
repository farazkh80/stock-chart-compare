import Link from 'next/link'

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-center flex-1">Stock Chart Comparator</h1>
        <Link href="/comparator" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
          Stock Comparator →
        </Link>
      </div>
      <div>
        <p>Stock comparison components will go here.</p>
      </div>
    </main>
  )
}

