$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open('C:\Users\Aditya\Downloads\CRM Documents\FORMAT - ONE TIME JOB.docx')
    $doc.SaveAs('D:\CRM\server\scratch\original_reference.pdf', 17)
    $doc.Close()
    Write-Host 'Success converting original to PDF'
} catch {
    Write-Host 'Error:' $_.Exception.Message
} finally {
    $word.Quit()
}
