$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open('D:\CRM\server\uploads\templates\FORMAT - ONE TIME JOB.docx')
    $doc.SaveAs('D:\CRM\server\scratch\format_reference.pdf', 17)
    $doc.Close()
    Write-Host 'Success converting to PDF'
} catch {
    Write-Host 'Error:' $_.Exception.Message
} finally {
    $word.Quit()
}
