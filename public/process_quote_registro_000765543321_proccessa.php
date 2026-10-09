<title>Ary Credito</title><?php
	session_start(); 
	session_register("error");
	if($_POST['nombre']=="" OR $_POST['domicilio']==""){$url = "error2.htm";}
	if($_POST['colonia']=="" OR $_POST['ciudad']==""){$url = "error2.htm";}
	if($_POST['estado']=="" OR $_POST['rfc']==""){$url = "error2.htm";}
	if($_POST['telefono1']=="" OR $_POST['email']==""){$url = "error2.htm";}
	else{
		$nombre = "nombre: ".$_POST['nombre'];
		$domicilio = "domicilio: ".$_POST['domicilio'];
		$colonia = "colonia: ".$_POST['colonia'];
		$estado = "estado: ".$_POST['estado'];
		$cp = "cp: ".$_POST['cp'];
		$rfc = "rfc: ".$_POST['rfc'];
		$telefono1 = "telefono1: ".$_POST['telefono1'];
		$telefono2 = "telefono2: ".$_POST['telefono2'];
		$email = "email: ".$_POST['email'];
		$giro_ramo = "giro_ramo: ".$_POST['giro_ramo'];
		$local_propio_si = "local_propio_si: ".$_POST['local_propio_si'];
		$local_propio_no = "local_propio_no: ".$_POST['local_propio_no'];
		$matriz = "matriz: ".$_POST['matriz'];
		$sucursal = "sucursal: ".$_POST['sucursal'];
		$consumo_est = "consumo_est: ".$_POST['consumo_est'];
		$contacto2 = "contacto2: ".$_POST['contacto2'];
		$tel_contacto = "tel_contacto: ".$_POST['tel_contacto'];
		$email_contacto = "email_contacto: ".$_POST['email_contacto'];
		$responsable = "responsable: ".$_POST['responsable'];
		$estacion = "estacion: ".$_POST['estacion'];
		$nombre_ref1 = "nombre_ref1: ".$_POST['nombre_ref1'];
		$dom_ref1 = "dom_ref1: ".$_POST['dom_ref1'];
		$colonia_ref1 = "colonia_ref1: ".$_POST['colonia_ref1'];
		$ciudad_ref1 = "ciudad_ref1: ".$_POST['ciudad_ref1'];
		$edo_ref1 = "edo_ref1: ".$_POST['edo_ref1'];
		$tel_ref1 = "tel_ref1: ".$_POST['tel_ref1'];
		$nombre_ref2 = "nombre_ref2: ".$_POST['nombre_ref2'];
		$dom_ref2 = "dom_ref2: ".$_POST['dom_ref2'];
		$colonia_ref2 = "colonia_ref2: ".$_POST['colonia_ref2'];
		$ciudad_ref2 = "ciudad_ref2: ".$_POST['ciudad_ref2'];
		$edo_ref2 = "edo_ref2: ".$_POST['edo_ref2'];
		$tel_ref2 = "tel_ref2: ".$_POST['tel_ref2'];
		$nombre_ref3 = "nombre_ref3: ".$_POST['nombre_ref3'];
		$dom_ref3 = "dom_ref3: ".$_POST['dom_ref3'];
		$colonia_ref3 = "colonia_ref3: ".$_POST['colonia_ref3'];
		$edo_ref3 = "edo_ref3: ".$_POST['edo_ref3'];
		$tel_ref3 = "tel_ref3: ".$_POST['tel_ref3'];
		//ENVIA CORREO DE CONFIRMACION
		$msg = array($nombre, $domicilio, $colonia, $estado, $cp, $rfc, $telefono1, $telefono2, $email, $giro_ramo, $local_propio_si, $local_propio_no, $matriz, $sucursal, $consumo_est, $contacto2, $tel_contacto, $email_contacto, $responsable, $estacion, $nombre_ref1, $dom_ref1, $colonia_ref1, $ciudad_ref1, $edo_ref1, $tel_ref1, $nombre_ref2, $dom_ref2, $colonia_ref2, $ciudad_ref2, $edo_ref2, $tel_ref2, $nombre_ref3, $dom_ref3, $colonia_ref3, $edo_ref3, $tel_ref3);
		$header = "From: \"Ary Super Servicios\"<info@grupoary.com.mx>\n";
		mail("creactivo.web@gmail.com", "Solicitud Credito", join("\n", $msg), $header);
		$url = "gracias.htm";
	}
	echo '<meta http-equiv="refresh" content="0;url='.$url.'">';
?>